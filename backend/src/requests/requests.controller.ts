import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import type { Response } from 'express';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ActRequestDto } from './dto/act-request.dto';
import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { PrismaService } from '../common/prisma.service';

@Controller('api/requests')
export class RequestsController {
  constructor(private requests: RequestsService, private prisma: PrismaService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('requestTypeId') requestTypeId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.requests.list(user, q, requestTypeId ? Number(requestTypeId) : undefined, status, Number(page) || 1);
  }

  @Get('create-options')
  createOptions(@CurrentUser() user: CurrentUserPayload, @Query('requestTypeId') requestTypeId?: string) {
    return this.requests.createOptions(user, requestTypeId ? Number(requestTypeId) : undefined);
  }

  @Get('export')
  async exportCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('requestTypeId') requestTypeId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.requests.exportCsv(user, q, requestTypeId ? Number(requestTypeId) : undefined, status);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
    res.send(csv);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRequestDto) {
    return this.requests.create(user, dto.requestTypeId, dto.fieldValues);
  }

  @Get(':id')
  getDetail(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.requests.getDetail(user, id);
  }

  @Post(':id/actions')
  act(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: ActRequestDto) {
    return this.requests.act(user, id, dto.action, dto.comment, dto.fieldValues);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.requests.remove(user, id);
  }

  @Post(':id/fields/:fieldId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => cb(null, `${randomUUID()}_${file.originalname}`),
      }),
    }),
  )
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const relativePath = `/uploads/${file.filename}`;
    const existing = await this.prisma.db.requestFieldValue.findFirst({ where: { requestId: id, fieldId } });
    if (existing) {
      await this.prisma.db.requestFieldValue.update({
        where: { id: existing.id },
        data: { value: relativePath, metaUpdatedAt: new Date(), metaUpdatedBy: user.userId },
      });
    } else {
      await this.prisma.db.requestFieldValue.create({
        data: { requestId: id, fieldId, value: relativePath, metaCreatedBy: user.userId },
      });
    }
    return { path: relativePath };
  }
}
