import { IsInt, IsObject } from 'class-validator';

export class CreateRequestDto {
  @IsInt()
  requestTypeId!: number;

  @IsObject()
  fieldValues!: Record<string, string>;
}
