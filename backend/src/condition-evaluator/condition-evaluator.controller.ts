import { Controller, Get } from '@nestjs/common';
import { ConditionEvaluatorService } from './condition-evaluator.service';

@Controller('api/condition-operators')
export class ConditionEvaluatorController {
  constructor(private conditionEvaluator: ConditionEvaluatorService) {}

  // Single source of truth for "which operators are legal for which field type" — the old app
  // duplicated this as a hardcoded JS object in Design.cshtml alongside the C# version; exposing
  // it here means the frontend never has to keep a second copy in sync.
  @Get()
  get() {
    return this.conditionEvaluator.operatorsByFieldType();
  }
}
