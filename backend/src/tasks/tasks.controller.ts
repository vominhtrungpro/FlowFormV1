import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { DelegateTaskDto } from './dto/delegate-task.dto';
import { ActRequestDto } from '../requests/dto/act-request.dto';
import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';

@Controller('api/tasks')
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get('mine')
  listMine(@CurrentUser() user: CurrentUserPayload, @Query('tab') tab?: string, @Query('page') page?: string) {
    return this.tasks.listMine(user, tab ?? 'assigned', Number(page) || 1);
  }

  @Get(':id')
  getDetail(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.getDetail(user, id);
  }

  @Post(':id/actions')
  act(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: ActRequestDto) {
    return this.tasks.actOnTask(user, id, dto.action, dto.comment, dto.fieldValues);
  }

  @Post(':id/delegate')
  delegate(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: DelegateTaskDto) {
    return this.tasks.delegate(id, user, dto.newAssigneeId);
  }

  @Post(':id/revoke-delegation')
  revokeDelegation(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.revokeDelegation(id, user);
  }
}
