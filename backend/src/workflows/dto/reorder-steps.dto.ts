import { IsArray, IsInt } from 'class-validator';

export class ReorderStepsDto {
  @IsArray()
  @IsInt({ each: true })
  orderedIds!: number[];
}
