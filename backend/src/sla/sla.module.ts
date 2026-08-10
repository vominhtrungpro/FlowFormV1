import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlaService } from './sla.service';

@Module({
  imports: [NotificationsModule],
  providers: [SlaService],
})
export class SlaModule {}
