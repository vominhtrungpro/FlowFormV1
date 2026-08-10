import { Body, Controller, Delete, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { SaveStepDto } from './dto/save-step.dto';

@Controller('api/steps')
export class StepsController {
  constructor(private workflows: WorkflowsService) {}

  @Patch(':id')
  save(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveStepDto) {
    return this.workflows.saveStep(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.workflows.removeStep(id);
  }
}
