import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';

export class ReorderFieldNode {
  @IsInt()
  id!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  children?: number[];
}

export class ReorderFieldsDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ReorderFieldNode)
  structure!: ReorderFieldNode[];
}
