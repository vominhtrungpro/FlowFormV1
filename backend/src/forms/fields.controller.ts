import { Body, Controller, Delete, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { FormsService } from './forms.service';
import { SaveFieldDto } from './dto/save-field.dto';

@Controller('api/fields')
export class FieldsController {
  constructor(private forms: FormsService) {}

  @Patch(':id')
  save(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveFieldDto) {
    return this.forms.saveField(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.forms.removeField(id);
  }
}
