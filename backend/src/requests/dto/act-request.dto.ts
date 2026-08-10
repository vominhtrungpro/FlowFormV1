import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { TransitionAction } from '../../common/enums';

export class ActRequestDto {
  @IsIn(TransitionAction as unknown as string[])
  action!: (typeof TransitionAction)[number];

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string>;
}
