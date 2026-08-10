import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { SaveWorkflowMetaDto } from './dto/save-workflow-meta.dto';
import { AddStepDto } from './dto/add-step.dto';
import { ReorderStepsDto } from './dto/reorder-steps.dto';

@Controller('api/workflows')
export class WorkflowsController {
  constructor(private workflows: WorkflowsService) {}

  @Get()
  list(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string) {
    return this.workflows.list(q, status, Number(page) || 1);
  }

  @Get(':id')
  getDesign(@Param('id', ParseIntPipe) id: number, @Query('stepId') stepId?: string) {
    return this.workflows.getDesign(id, stepId ? Number(stepId) : undefined);
  }

  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.createWorkflow(dto.requestTypeName);
  }

  @Patch(':id/meta')
  saveMeta(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveWorkflowMetaDto) {
    return this.workflows.saveMeta(id, dto.name, dto.status);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.workflows.deleteWorkflow(id);
  }

  @Post(':id/steps')
  addStep(@Param('id', ParseIntPipe) id: number, @Body() dto: AddStepDto) {
    return this.workflows.addStep(id, dto.type);
  }

  @Post(':id/steps/reorder')
  reorder(@Param('id', ParseIntPipe) id: number, @Body() dto: ReorderStepsDto) {
    return this.workflows.reorderSteps(id, dto.orderedIds);
  }
}
