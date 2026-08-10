import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { FieldType, FieldWidth } from '../../common/enums';

export class TableColumnInput {
  name!: string;
  type!: 'Text' | 'Dropdown';
  options?: string[];
}

export class SaveFieldDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  helpText?: string | null;

  @IsIn(FieldType as unknown as string[])
  type!: (typeof FieldType)[number];

  @IsIn(FieldWidth as unknown as string[])
  width!: (typeof FieldWidth)[number];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  readOnlyAfterSubmit?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInPrintSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  trackAuditLog?: boolean;

  @IsOptional()
  @IsString()
  visibilityCondition?: string | null;

  @IsOptional()
  @IsString()
  defaultValue?: string | null;

  // Dropdown/Checklist
  @IsOptional()
  @IsString()
  options?: string | null;

  // Table
  @IsOptional()
  @IsArray()
  tableColumns?: TableColumnInput[];

  @IsOptional()
  @IsInt()
  minLength?: number | null;

  @IsOptional()
  @IsInt()
  maxLength?: number | null;

  @IsOptional()
  minValue?: number | null;

  @IsOptional()
  maxValue?: number | null;

  @IsOptional()
  @IsString()
  minDate?: string | null;

  @IsOptional()
  @IsString()
  maxDate?: string | null;

  @IsOptional()
  @IsInt()
  maxFileSizeMb?: number | null;

  @IsOptional()
  @IsString()
  pickerActorType?: string | null;

  @IsOptional()
  @IsString()
  pickerActorRef?: string | null;

  @IsOptional()
  @IsBoolean()
  useForNextStepActor?: boolean;
}
