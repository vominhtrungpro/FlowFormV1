import { Module } from '@nestjs/common';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import { ConditionEvaluatorController } from './condition-evaluator.controller';

@Module({
  providers: [ConditionEvaluatorService],
  controllers: [ConditionEvaluatorController],
  exports: [ConditionEvaluatorService],
})
export class ConditionEvaluatorModule {}
