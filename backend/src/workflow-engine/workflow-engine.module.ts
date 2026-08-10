import { Module } from '@nestjs/common';
import { ConditionEvaluatorModule } from '../condition-evaluator/condition-evaluator.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowEngineService } from './workflow-engine.service';

@Module({
  imports: [ConditionEvaluatorModule, NotificationsModule],
  providers: [WorkflowEngineService],
  exports: [WorkflowEngineService],
})
export class WorkflowEngineModule {}
