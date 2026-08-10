import { Module } from '@nestjs/common';
import { ConditionEvaluatorModule } from '../condition-evaluator/condition-evaluator.module';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { StepsController } from './steps.controller';

@Module({
  imports: [ConditionEvaluatorModule],
  providers: [WorkflowsService],
  controllers: [WorkflowsController, StepsController],
})
export class WorkflowsModule {}
