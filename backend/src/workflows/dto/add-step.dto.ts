import { IsIn, IsOptional } from 'class-validator';
import { StepType } from '../../common/enums';

export class AddStepDto {
  @IsOptional()
  @IsIn(StepType as unknown as string[])
  type?: (typeof StepType)[number];
}
