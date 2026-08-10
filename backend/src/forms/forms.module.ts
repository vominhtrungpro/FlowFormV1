import { Module } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';
import { FieldsController } from './fields.controller';

@Module({
  providers: [FormsService],
  controllers: [FormsController, FieldsController],
})
export class FormsModule {}
