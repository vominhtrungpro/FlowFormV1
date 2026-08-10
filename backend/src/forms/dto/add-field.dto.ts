import { IsIn, IsInt, IsOptional } from 'class-validator';
import { FieldType } from '../../common/enums';

export class AddFieldDto {
  @IsOptional()
  @IsIn(FieldType as unknown as string[])
  type?: (typeof FieldType)[number];

  @IsOptional()
  @IsInt()
  parentFieldId?: number | null;
}
