import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';

@Controller('api/notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('recent')
  recent(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.recent(user.userId);
  }

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
  ) {
    return this.notifications.list(user.userId, unreadOnly === 'true', Number(page) || 1);
  }

  @Get(':id/open')
  open(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.open(user.userId, id);
  }

  @Post('mark-all-read')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.userId);
  }
}
