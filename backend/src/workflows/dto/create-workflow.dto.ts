import { IsString, MinLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  requestTypeName!: string;
}
