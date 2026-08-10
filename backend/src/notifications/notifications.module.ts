import { Module } from '@nestjs/common';
import { NotificationsGatewayModule } from '../notifications-gateway/notifications-gateway.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [NotificationsGatewayModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
