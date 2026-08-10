import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { SaveFormMetaDto } from './dto/save-form-meta.dto';
import { AddFieldDto } from './dto/add-field.dto';
import { ReorderFieldsDto } from './dto/reorder-fields.dto';

@Controller('api/forms')
export class FormsController {
  constructor(private forms: FormsService) {}

  @Get()
  list(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string) {
    return this.forms.list(q, status, Number(page) || 1);
  }

  @Get(':id')
  getDesign(@Param('id', ParseIntPipe) id: number, @Query('fieldId') fieldId?: string) {
    return this.forms.getDesign(id, fieldId ? Number(fieldId) : undefined);
  }

  @Post()
  create(@Body() dto: CreateFormDto) {
    return this.forms.createForm(dto.name);
  }

  @Patch(':id/meta')
  saveMeta(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveFormMetaDto) {
    return this.forms.saveMeta(id, dto.name, dto.status);
  }

  @Post(':id/publish')
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.forms.publish(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.forms.deleteForm(id);
  }

  @Post(':id/fields')
  addField(@Param('id', ParseIntPipe) id: number, @Body() dto: AddFieldDto) {
    return this.forms.addField(id, dto.type, dto.parentFieldId);
  }

  @Post(':id/fields/reorder')
  reorder(@Param('id', ParseIntPipe) id: number, @Body() dto: ReorderFieldsDto) {
    return this.forms.reorderFields(id, dto.structure);
  }
}
