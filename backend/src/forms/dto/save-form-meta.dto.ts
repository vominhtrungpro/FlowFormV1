import { IsIn, IsString } from 'class-validator';
import { DefinitionStatus } from '../../common/enums';

export class SaveFormMetaDto {
  @IsString()
  name!: string;

  @IsIn(DefinitionStatus as unknown as string[])
  status!: (typeof DefinitionStatus)[number];
}
