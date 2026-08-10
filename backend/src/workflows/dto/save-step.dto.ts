import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { ActorType, ConditionOperator, SlaUnit, StepType } from '../../common/enums';

export class GatekeeperInput {
  userId!: number;
  function!: string;
}

export class ConditionRuleInput {
  fieldId!: number;
  operator!: (typeof ConditionOperator)[number];
  compareValue?: string | null;
  toStepId?: number | null;
}

export class SaveStepDto {
  @IsString()
  name!: string;

  @IsIn(StepType as unknown as string[])
  type!: (typeof StepType)[number];

  @IsIn(ActorType as unknown as string[])
  actorType!: (typeof ActorType)[number];

  @IsOptional()
  @IsString()
  actorRef?: string;

  @IsOptional()
  @IsInt()
  slaValue?: number | null;

  @IsOptional()
  @IsIn([...SlaUnit, null])
  slaUnit?: (typeof SlaUnit)[number] | null;

  @IsOptional()
  @IsString()
  escalateTo?: string | null;

  @IsOptional()
  @IsInt()
  formDefinitionId?: number | null;

  @IsOptional()
  @IsBoolean()
  sequentialApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  allowReturn?: boolean;

  @IsOptional()
  @IsInt()
  nextStepId?: number | null;

  @IsOptional()
  @IsArray()
  gatekeepers?: GatekeeperInput[];

  @IsOptional()
  @IsArray()
  conditionRules?: ConditionRuleInput[];

  @IsOptional()
  @IsInt()
  conditionElseToStepId?: number | null;
}
