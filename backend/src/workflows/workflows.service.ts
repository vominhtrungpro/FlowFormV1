import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConditionEvaluatorService, REFERENCEABLE_FIELD_TYPES } from '../condition-evaluator/condition-evaluator.service';
import { GATEKEEPER_FUNCTIONS } from '../common/enums';
import { SaveStepDto, GatekeeperInput, ConditionRuleInput } from './dto/save-step.dto';

const PAGE_SIZE = 10;

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService, private conditionEvaluator: ConditionEvaluatorService) {}

  async list(q?: string, status?: string, page = 1) {
    const where: any = {};
    if (status) where.status = status;
    if (q) where.requestType = { name: { contains: q } };

    const all = await this.prisma.db.workflowDefinition.findMany({
      where,
      include: { requestType: true, steps: { where: { metaIsDeleted: false } } },
      orderBy: { id: 'desc' },
    });

    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const pageClamped = Math.max(1, page);
    const items = all.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    return {
      page: pageClamped,
      totalPages,
      items: items.map((w) => ({
        id: w.id,
        requestTypeName: w.requestType.name,
        versionNumber: w.versionNumber,
        status: w.status,
        stepCount: w.steps.length,
        publishedAt: w.publishedAt,
      })),
    };
  }

  private async getEarlierScalarFields(step: { workflowDefinitionId: number; orderIndex: number }) {
    const earlierSteps = await this.prisma.db.step.findMany({
      where: { workflowDefinitionId: step.workflowDefinitionId, orderIndex: { lt: step.orderIndex }, formDefinitionId: { not: null } },
      include: { formDefinition: { include: { fields: { where: { metaIsDeleted: false } } } } },
    });
    const fields = earlierSteps.flatMap((s) => s.formDefinition?.fields ?? []);
    return fields.filter((f) => REFERENCEABLE_FIELD_TYPES.includes(f.type as any));
  }

  async getDesign(workflowId: number, stepId?: number) {
    const workflow = await this.prisma.db.workflowDefinition.findFirst({ where: { id: workflowId }, include: { requestType: true } });
    if (!workflow) throw new NotFoundException();

    const steps = await this.prisma.db.step.findMany({
      where: { workflowDefinitionId: workflowId },
      orderBy: { orderIndex: 'asc' },
      include: {
        transitionsFrom: { where: { metaIsDeleted: false } },
        gatekeepers: { where: { metaIsDeleted: false }, include: { user: true } },
        conditionRulesOf: { where: { metaIsDeleted: false }, include: { field: true, toStep: true } },
        formDefinition: true,
      },
    });

    const selected = (stepId && steps.find((s) => s.id === stepId)) || steps[0] || null;

    const forms = await this.prisma.db.formDefinition.findMany({ orderBy: { name: 'asc' } });
    const users = await this.prisma.db.user.findMany({ orderBy: { email: 'asc' } });
    const roleOptions = [...new Set(users.map((u) => u.role))].sort();
    const tagOptions = [...new Set(users.map((u) => u.tag))].sort();

    let conditionFieldOptions: any[] = [];
    let conditionTargetSteps: any[] = [];
    if (selected?.type === 'Condition') {
      conditionFieldOptions = await this.getEarlierScalarFields(selected);
      conditionTargetSteps = steps.filter((s) => s.id !== selected.id);
    }

    return {
      workflow: { id: workflow.id, requestTypeName: workflow.requestType.name, versionNumber: workflow.versionNumber, status: workflow.status },
      steps,
      selected,
      forms,
      users,
      roleOptions,
      tagOptions,
      gatekeeperFunctions: GATEKEEPER_FUNCTIONS,
      conditionFieldOptions,
      conditionTargetSteps,
    };
  }

  // Renames the RequestType (not the WorkflowDefinition itself). Transitioning INTO Published (from
  // a non-Published status) stamps publishedAt; transitioning OUT leaves the historical
  // publishedAt untouched — it means "first (or last re-)published", never cleared.
  async saveMeta(workflowId: number, name: string, status: string) {
    const workflow = await this.prisma.db.workflowDefinition.findFirst({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException();

    if (name?.trim()) {
      await this.prisma.db.requestType.update({ where: { id: workflow.requestTypeId }, data: { name: name.trim() } });
    }

    const becamePublished = status === 'Published' && workflow.status !== 'Published';
    await this.prisma.db.workflowDefinition.update({
      where: { id: workflowId },
      data: { status, publishedAt: becamePublished ? new Date() : undefined },
    });
  }

  async deleteWorkflow(workflowId: number) {
    const inFlight = await this.prisma.db.request.count({ where: { workflowDefinitionId: workflowId, currentStepId: { not: null } } });
    if (inFlight > 0) throw new BadRequestException('This workflow has in-flight requests — it cannot be removed.');

    const workflow = await this.prisma.db.workflowDefinition.findFirst({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException();

    await this.prisma.db.workflowDefinition.update({ where: { id: workflowId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });

    const requestType = await this.prisma.db.requestType.findFirst({ where: { id: workflow.requestTypeId } });
    if (requestType?.currentWorkflowDefinitionId === workflowId) {
      await this.prisma.db.requestType.update({ where: { id: requestType.id }, data: { currentWorkflowDefinitionId: null } });
    }
  }

  async createWorkflow(requestTypeName: string) {
    const name = requestTypeName?.trim() || 'New request type';
    const code = name.toUpperCase().replace(/\s+/g, '_');
    const requestType = await this.prisma.db.requestType.create({ data: { name, code } });
    const workflow = await this.prisma.db.workflowDefinition.create({
      data: { requestTypeId: requestType.id, versionNumber: 1, status: 'Published', publishedAt: new Date() },
    });
    await this.prisma.db.requestType.update({ where: { id: requestType.id }, data: { currentWorkflowDefinitionId: workflow.id } });
    return { id: workflow.id };
  }

  async addStep(workflowDefinitionId: number, requestedType?: string) {
    const steps = await this.prisma.db.step.findMany({ where: { workflowDefinitionId }, orderBy: { orderIndex: 'asc' } });
    const isFirst = steps.length === 0;
    const previousStep = isFirst ? null : steps[steps.length - 1];

    let type = requestedType ?? (isFirst ? 'ActionTask' : 'ApprovalGate');
    if (isFirst && type === 'Condition') type = 'ActionTask'; // a Condition step can never be first

    const name = isFirst ? 'Submit' : `New ${type}`;
    const actorRef = isFirst ? 'Requester' : 'Approver';

    const newStep = await this.prisma.db.step.create({
      data: { workflowDefinitionId, orderIndex: steps.length, name, type, actorType: 'Role', actorRef },
    });

    if (previousStep) {
      if (previousStep.type === 'Condition') {
        const elseRule = await this.prisma.db.stepConditionRule.findFirst({ where: { stepId: previousStep.id, isElse: true } });
        if (elseRule && elseRule.toStepId === null) {
          await this.prisma.db.stepConditionRule.update({ where: { id: elseRule.id }, data: { toStepId: newStep.id } });
        }
      } else {
        const dangling = await this.prisma.db.transition.findMany({
          where: { fromStepId: previousStep.id, toStepId: null, NOT: { action: 'Reject' } },
        });
        if (dangling.length > 0) {
          for (const t of dangling) await this.prisma.db.transition.update({ where: { id: t.id }, data: { toStepId: newStep.id } });
        } else {
          await this.prisma.db.transition.create({
            data: { fromStepId: previousStep.id, action: previousStep.type === 'ActionTask' ? 'Submit' : 'Approve', toStepId: newStep.id },
          });
        }
      }
    }

    if (type === 'Condition') {
      await this.prisma.db.stepConditionRule.create({ data: { stepId: newStep.id, orderIndex: 0, isElse: true, toStepId: null } });
    } else {
      const advanceAction = type === 'ActionTask' ? 'Submit' : 'Approve';
      await this.prisma.db.transition.create({ data: { fromStepId: newStep.id, action: advanceAction, toStepId: null } });
      if (type === 'ApprovalGate') {
        await this.prisma.db.transition.create({ data: { fromStepId: newStep.id, action: 'Reject', toStepId: null } });
        if (previousStep) {
          await this.prisma.db.transition.create({ data: { fromStepId: newStep.id, action: 'Return', toStepId: previousStep.id } });
        }
      }
    }

    return { id: newStep.id };
  }

  async removeStep(stepId: number) {
    const step = await this.prisma.db.step.findFirst({ where: { id: stepId } });
    if (!step) throw new NotFoundException();

    const allSteps = await this.prisma.db.step.findMany({
      where: { workflowDefinitionId: step.workflowDefinitionId },
      orderBy: { orderIndex: 'asc' },
    });
    if (allSteps.length <= 1) throw new BadRequestException('A workflow needs at least one step.');

    const inFlight = await this.prisma.db.request.count({ where: { currentStepId: stepId } });
    if (inFlight > 0) throw new BadRequestException('This step has in-flight requests — it cannot be removed.');

    const index = allSteps.findIndex((s) => s.id === stepId);
    const nextStep = allSteps[index + 1] ?? null;

    const incomingTransitions = await this.prisma.db.transition.findMany({ where: { toStepId: stepId } });
    for (const t of incomingTransitions) {
      // Redirecting straight to nextStep would create a self-loop when the edge being redirected
      // is nextStep's own outgoing transition (e.g. nextStep's Return-to-predecessor happened to
      // target the step we're removing) — soft-delete it instead of pointing a step at itself.
      if (t.fromStepId === nextStep?.id) {
        await this.prisma.db.transition.update({ where: { id: t.id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
      } else {
        await this.prisma.db.transition.update({ where: { id: t.id }, data: { toStepId: nextStep?.id ?? null } });
      }
    }
    await this.prisma.db.transition.updateMany({ where: { fromStepId: stepId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });

    const incomingRules = await this.prisma.db.stepConditionRule.findMany({ where: { toStepId: stepId } });
    let rewiredConditionRule = false;
    for (const r of incomingRules) {
      await this.prisma.db.stepConditionRule.update({ where: { id: r.id }, data: { toStepId: nextStep?.id ?? null } });
      rewiredConditionRule = true;
    }
    await this.prisma.db.stepConditionRule.updateMany({ where: { stepId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });

    await this.prisma.db.step.update({ where: { id: stepId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });

    const remaining = allSteps.filter((s) => s.id !== stepId);
    for (let i = 0; i < remaining.length; i++) {
      await this.prisma.db.step.update({ where: { id: remaining[i].id }, data: { orderIndex: i } });
    }

    const selectedStepId = nextStep?.id ?? remaining[remaining.length - 1]?.id ?? null;
    return {
      selectedStepId,
      notice: rewiredConditionRule
        ? 'A condition rule pointed at the removed step and was redirected to the next step by order — double-check your branching.'
        : undefined,
    };
  }

  async saveStep(stepId: number, dto: SaveStepDto) {
    const step = await this.prisma.db.step.findFirst({ where: { id: stepId } });
    if (!step) throw new NotFoundException();

    let type = dto.type;
    if (step.orderIndex === 0 && type === 'Condition') type = 'ActionTask';

    const isApprovalGate = type === 'ApprovalGate';
    const isCondition = type === 'Condition';

    await this.prisma.db.step.update({
      where: { id: stepId },
      data: {
        name: dto.name,
        type,
        actorType: dto.actorType,
        actorRef: dto.actorRef ?? '',
        slaValue: dto.slaValue ?? null,
        slaUnit: dto.slaUnit ?? null,
        escalateTo: dto.escalateTo ?? null,
        formDefinitionId: isCondition ? null : dto.formDefinitionId ?? null,
        sequentialApproval: isApprovalGate ? !!dto.sequentialApproval : false,
      },
    });

    if (isCondition) {
      await this.prisma.db.transition.updateMany({ where: { fromStepId: stepId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
    } else {
      await this.saveTransitions(stepId, step.workflowDefinitionId, step.orderIndex, type!, isApprovalGate, dto);
    }

    if (isCondition) {
      await this.saveConditionRules(stepId, step.workflowDefinitionId, step.orderIndex, dto.conditionRules ?? [], dto.conditionElseToStepId ?? null);
    } else {
      await this.prisma.db.stepConditionRule.updateMany({ where: { stepId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
    }

    if (isApprovalGate) {
      await this.saveGatekeepers(stepId, dto.gatekeepers ?? []);
    } else {
      await this.prisma.db.stepGatekeeper.updateMany({ where: { stepId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
    }

    return { id: stepId };
  }

  private async saveTransitions(
    stepId: number,
    workflowDefinitionId: number,
    orderIndex: number,
    type: string,
    isApprovalGate: boolean,
    dto: SaveStepDto,
  ) {
    const previousStep = await this.prisma.db.step.findFirst({ where: { workflowDefinitionId, orderIndex: orderIndex - 1 } });
    const wantsReturn = isApprovalGate && !!dto.allowReturn && !!previousStep;
    const existingReturn = await this.prisma.db.transition.findFirst({ where: { fromStepId: stepId, action: 'Return' } });

    if (wantsReturn) {
      if (!existingReturn) {
        await this.prisma.db.transition.create({ data: { fromStepId: stepId, action: 'Return', toStepId: previousStep!.id } });
      } else if (existingReturn.toStepId !== previousStep!.id) {
        await this.prisma.db.transition.update({ where: { id: existingReturn.id }, data: { toStepId: previousStep!.id } });
      }
    } else if (existingReturn) {
      await this.prisma.db.transition.update({ where: { id: existingReturn.id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
    }

    const advanceAction = type === 'ActionTask' ? 'Submit' : 'Approve';
    const existingAdvance = await this.prisma.db.transition.findFirst({ where: { fromStepId: stepId, action: advanceAction } });
    const siblingIds = new Set(
      (await this.prisma.db.step.findMany({ where: { workflowDefinitionId, NOT: { id: stepId } } })).map((s) => s.id),
    );
    const postedNextStepId = dto.nextStepId && siblingIds.has(dto.nextStepId) ? dto.nextStepId : null;

    if (!existingAdvance) {
      await this.prisma.db.transition.create({ data: { fromStepId: stepId, action: advanceAction, toStepId: postedNextStepId } });
    } else if (existingAdvance.toStepId !== postedNextStepId) {
      await this.prisma.db.transition.update({ where: { id: existingAdvance.id }, data: { toStepId: postedNextStepId } });
    }
  }

  private async saveGatekeepers(stepId: number, gatekeepers: GatekeeperInput[]) {
    const posted = gatekeepers
      .filter((g) => g.function?.trim())
      .map((g) => ({ userId: g.userId, function: g.function.trim() }))
      .filter((g, i, arr) => arr.findIndex((x) => x.userId === g.userId && x.function === g.function) === i);

    const existing = await this.prisma.db.stepGatekeeper.findMany({ where: { stepId } });

    for (const e of existing) {
      if (!posted.some((p) => p.userId === e.userId && p.function === e.function)) {
        await this.prisma.db.stepGatekeeper.update({ where: { id: e.id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
      }
    }
    for (const p of posted) {
      if (!existing.some((e) => e.userId === p.userId && e.function === p.function)) {
        await this.prisma.db.stepGatekeeper.create({ data: { stepId, userId: p.userId, function: p.function } });
      }
    }
  }

  private async saveConditionRules(
    stepId: number,
    workflowDefinitionId: number,
    orderIndex: number,
    rules: ConditionRuleInput[],
    elseToStepId: number | null,
  ) {
    const earlierFields = await this.getEarlierScalarFields({ workflowDefinitionId, orderIndex });
    const earlierFieldsById = new Map(earlierFields.map((f) => [f.id, f]));
    const workflowStepIds = new Set(
      (await this.prisma.db.step.findMany({ where: { workflowDefinitionId } })).map((s) => s.id),
    );

    const validated: Array<{ fieldId: number; operator: string; compareValue: string | null; toStepId: number | null }> = [];
    rules.forEach((rule) => {
      const field = earlierFieldsById.get(rule.fieldId);
      if (!field) return; // not an earlier scalar field — drop
      if (!this.conditionEvaluator.isOperatorLegal(field.type as any, rule.operator)) return;
      if (rule.operator !== 'IsEmpty' && rule.operator !== 'IsNotEmpty' && !rule.compareValue?.trim()) return;
      const toStepId = rule.toStepId != null && workflowStepIds.has(rule.toStepId) ? rule.toStepId : null;
      validated.push({ fieldId: rule.fieldId, operator: rule.operator, compareValue: rule.compareValue ?? null, toStepId });
    });

    const key = (r: { fieldId: number | null; operator: string | null; compareValue: string | null; toStepId: number | null }) =>
      `${r.fieldId}|${r.operator}|${r.compareValue}|${r.toStepId}`;

    const existingRules = await this.prisma.db.stepConditionRule.findMany({ where: { stepId, isElse: false } });
    const consumed = new Set<number>();

    for (let i = 0; i < validated.length; i++) {
      const match = existingRules.find((e) => !consumed.has(e.id) && key(e) === key(validated[i]));
      if (match) {
        consumed.add(match.id);
        await this.prisma.db.stepConditionRule.update({ where: { id: match.id }, data: { orderIndex: i } });
      } else {
        await this.prisma.db.stepConditionRule.create({
          data: { stepId, orderIndex: i, isElse: false, ...validated[i] },
        });
      }
    }
    for (const e of existingRules) {
      if (!consumed.has(e.id)) {
        await this.prisma.db.stepConditionRule.update({ where: { id: e.id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
      }
    }

    const resolvedElseToStepId = elseToStepId != null && workflowStepIds.has(elseToStepId) ? elseToStepId : null;
    const existingElse = await this.prisma.db.stepConditionRule.findFirst({ where: { stepId, isElse: true } });
    if (!existingElse) {
      await this.prisma.db.stepConditionRule.create({ data: { stepId, orderIndex: 0, isElse: true, toStepId: resolvedElseToStepId } });
    } else if (existingElse.toStepId !== resolvedElseToStepId) {
      await this.prisma.db.stepConditionRule.update({ where: { id: existingElse.id }, data: { toStepId: resolvedElseToStepId } });
    }
  }

  // Drag-and-drop reorder — refuses outright (not "best effort") if the workflow has a Condition
  // step, or if any step's transition shape deviates from the exact auto-generated standard shape
  // (a custom Return target, multiple Returns, extra transitions). Only when every step passes does
  // it reassign OrderIndex and rewrite every advance/Return transition target.
  async reorderSteps(workflowDefinitionId: number, orderedIds: number[]) {
    const steps = await this.prisma.db.step.findMany({
      where: { workflowDefinitionId },
      orderBy: { orderIndex: 'asc' },
      include: { transitionsFrom: { where: { metaIsDeleted: false } } },
    });

    const existingIds = new Set(steps.map((s) => s.id));
    if (orderedIds.length !== steps.length || !orderedIds.every((id) => existingIds.has(id))) {
      throw new BadRequestException('Reorder payload does not match the current steps.');
    }
    if (steps.some((s) => s.type === 'Condition')) {
      throw new BadRequestException('This workflow has a Condition step — drag-and-drop reordering is disabled.');
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const currentNext = steps[i + 1] ?? null;
      const currentPrev = steps[i - 1] ?? null;
      const transitions = step.transitionsFrom;

      const advanceAction = step.type === 'ActionTask' ? 'Submit' : 'Approve';
      const advance = transitions.find((t) => t.action === advanceAction);
      if (!advance || advance.toStepId !== (currentNext?.id ?? null)) {
        throw new BadRequestException(`Step "${step.name}" has a custom transition shape — reorder refused.`);
      }

      let returnCount = 0;
      if (step.type === 'ApprovalGate') {
        const reject = transitions.find((t) => t.action === 'Reject');
        if (!reject || reject.toStepId !== null) {
          throw new BadRequestException(`Step "${step.name}" has a custom transition shape — reorder refused.`);
        }
        const returns = transitions.filter((t) => t.action === 'Return');
        if (returns.length > 1) throw new BadRequestException(`Step "${step.name}" has more than one Return edge — reorder refused.`);
        if (returns.length === 1 && returns[0].toStepId !== (currentPrev?.id ?? null)) {
          throw new BadRequestException(`Step "${step.name}" has a custom Return target — reorder refused.`);
        }
        returnCount = returns.length;
      } else {
        returnCount = transitions.filter((t) => t.action === 'Return').length;
        if (returnCount > 0) throw new BadRequestException(`Step "${step.name}" has a custom transition shape — reorder refused.`);
      }

      const expectedCount = (step.type === 'ApprovalGate' ? 2 : 1) + returnCount;
      if (transitions.length !== expectedCount) {
        throw new BadRequestException(`Step "${step.name}" has a custom transition shape — reorder refused.`);
      }
    }

    const stepsById = new Map(steps.map((s) => [s.id, s]));
    for (let i = 0; i < orderedIds.length; i++) {
      await this.prisma.db.step.update({ where: { id: orderedIds[i] }, data: { orderIndex: i } });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      const step = stepsById.get(orderedIds[i])!;
      const newNextId = orderedIds[i + 1] ?? null;
      const newPrevId = orderedIds[i - 1] ?? null;
      const advanceAction = step.type === 'ActionTask' ? 'Submit' : 'Approve';

      await this.prisma.db.transition.updateMany({
        where: { fromStepId: step.id, action: advanceAction },
        data: { toStepId: newNextId },
      });

      if (step.type === 'ApprovalGate') {
        const returnTransition = step.transitionsFrom.find((t) => t.action === 'Return');
        if (returnTransition) {
          if (i === 0) {
            await this.prisma.db.transition.update({
              where: { id: returnTransition.id },
              data: { metaIsDeleted: true, metaUpdatedAt: new Date() },
            });
          } else {
            await this.prisma.db.transition.update({ where: { id: returnTransition.id }, data: { toStepId: newPrevId } });
          }
        }
      }
    }
  }
}
