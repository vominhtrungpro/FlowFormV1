import { IsInt } from 'class-validator';

export class DelegateTaskDto {
  @IsInt()
  newAssigneeId!: number;
}
