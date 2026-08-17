import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowEngineModule } from '../workflow-engine/workflow-engine.module';
import { RequestsModule } from '../requests/requests.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [NotificationsModule, WorkflowEngineModule, RequestsModule],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
