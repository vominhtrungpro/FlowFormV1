import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../common/prisma.service';
import { ActorResolverService } from '../common/actor-resolver.service';
import { WorkflowEngineService } from '../workflow-engine/workflow-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUserPayload } from '../common/current-user.decorator';
import { TransitionAction } from '../common/enums';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PAGE_SIZE = 10;

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private actorResolver: ActorResolverService,
    private engine: WorkflowEngineService,
    private notifications: NotificationsService,
  ) {}

  private isAdmin(user: CurrentUserPayload) {
    return user.role.toLowerCase() === 'admin';
  }

  // Ports _StepChips.cshtml's ActorSummary local function — the short "who acts here" label shown
  // under each step in the gate-rail stepper and the create-page Route panel.
  private actorSummary(step: { type: string; actorType: string; actorRef: string; gatekeepers?: { id: number }[] }) {
    if (step.type === 'Condition') return 'Auto-routed';
    if (step.type === 'ApprovalGate') {
      const count = step.gatekeepers?.length ?? 0;
      if (count > 0) return count === 1 ? '1 gatekeeper' : `${count} gatekeepers`;
    }
    return step.actorRef?.trim() ? step.actorRef : step.actorType;
  }

  private async stepsForDisplay(workflowDefinitionId: number) {
    const steps = await this.prisma.db.step.findMany({
      where: { workflowDefinitionId },
      orderBy: { orderIndex: 'asc' },
      include: {
        gatekeepers: { where: { metaIsDeleted: false } },
        formDefinition: { include: { fields: { where: { metaIsDeleted: false }, orderBy: { orderIndex: 'asc' } } } },
      },
    });
    return steps.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      orderIndex: s.orderIndex,
      actorType: s.actorType,
      actorRef: s.actorRef,
      actorSummary: this.actorSummary(s),
      gatekeepers: s.gatekeepers,
      formFields: s.formDefinition?.fields ?? [],
    }));
  }

  // Ports RequestController.VisibleRequests/CanViewRequest: admin sees everything; everyone else
  // only sees a request once it's reached (or passed through) a step whose who-acts matches them.
  // "Reached" = current step + every step recorded in history — a step-actor keeps seeing it even
  // after it moves on. Soft-deleted steps still count (a since-removed step a request passed
  // through), so this reads through the RAW prisma client (this.prisma.step, not .db.step).
  async list(user: CurrentUserPayload, q?: string, requestTypeId?: number, status?: string, page = 1) {
    const where: any = {};
    if (q) {
      where.OR = [
        { code: { contains: q } },
        { title: { contains: q } },
        { requester: { contains: q } },
      ];
    }
    if (requestTypeId) where.requestTypeId = requestTypeId;
    if (status) where.status = status;

    const all = await this.prisma.db.request.findMany({
      where,
      include: { currentStep: true, requestType: true, histories: { where: { metaIsDeleted: false } } },
      orderBy: { id: 'desc' },
    });

    const visible = this.isAdmin(user) ? all : await this.filterVisible(all, user);

    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const pageClamped = Math.max(1, page);
    const items = visible.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    return {
      page: pageClamped,
      totalPages,
      items: items.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        requester: r.requester,
        requestTypeName: r.requestType.name,
        currentStepName: r.currentStep?.name ?? null,
        status: r.status,
        createdAt: r.metaCreatedAt,
      })),
    };
  }

  private async filterVisible<T extends { currentStepId: number | null; histories: Array<{ stepId: number | null }> }>(
    requests: T[],
    user: CurrentUserPayload,
  ): Promise<T[]> {
    const allSteps = await this.prisma.step.findMany();
    const stepsById = new Map(allSteps.map((s) => [s.id, s]));
    const result: T[] = [];

    for (const request of requests) {
      const reachedStepIds = new Set<number>();
      for (const h of request.histories) if (h.stepId != null) reachedStepIds.add(h.stepId);
      if (request.currentStepId != null) reachedStepIds.add(request.currentStepId);

      let visible = false;
      for (const stepId of reachedStepIds) {
        const step = stepsById.get(stepId);
        if (step && (await this.actorResolver.matchesCurrentUser(step, user))) {
          visible = true;
          break;
        }
      }
      if (visible) result.push(request);
    }
    return result;
  }

  async createOptions(user: CurrentUserPayload, requestTypeId?: number) {
    const requestTypes = await this.prisma.db.requestType.findMany();

    const eligible: typeof requestTypes = [];
    for (const rt of requestTypes) {
      if (!rt.currentWorkflowDefinitionId) continue;
      const wf = await this.prisma.db.workflowDefinition.findFirst({ where: { id: rt.currentWorkflowDefinitionId } });
      if (!wf || wf.status !== 'Published') continue;
      const firstStep = await this.prisma.db.step.findFirst({
        where: { workflowDefinitionId: wf.id, orderIndex: 0 },
      });
      if (firstStep && (await this.actorResolver.matchesCurrentUser(firstStep, user))) eligible.push(rt);
    }

    if (eligible.length === 0) return { requestTypes: [], selected: null, fields: [] };

    const selected = eligible.find((rt) => rt.id === requestTypeId) ?? eligible[0];
    const wf = await this.prisma.db.workflowDefinition.findFirst({ where: { id: selected.currentWorkflowDefinitionId! } });
    const steps = await this.stepsForDisplay(wf!.id);
    const firstStep = steps[0];

    return {
      requestTypes: eligible.map((rt) => ({ id: rt.id, name: rt.name })),
      selected: { id: selected.id, name: selected.name },
      stepName: firstStep?.name,
      workflowName: selected.name,
      steps: steps.map((s) => ({ id: s.id, name: s.name, type: s.type, actorSummary: s.actorSummary })),
      fields: firstStep?.formFields ?? [],
    };
  }

  async create(user: CurrentUserPayload, requestTypeId: number, fieldValues: Record<string, string>) {
    const requestType = await this.prisma.db.requestType.findFirst({ where: { id: requestTypeId } });
    if (!requestType?.currentWorkflowDefinitionId) throw new BadRequestException('Request type not available.');
    const wf = await this.prisma.db.workflowDefinition.findFirst({ where: { id: requestType.currentWorkflowDefinitionId } });
    if (!wf || wf.status !== 'Published') throw new BadRequestException('Request type not available.');

    const firstStep = await this.prisma.db.step.findFirst({
      where: { workflowDefinitionId: wf.id, orderIndex: 0 },
      include: { formDefinition: { include: { fields: { where: { metaIsDeleted: false } } } } },
    });
    if (!firstStep) throw new BadRequestException('Workflow has no first step.');
    if (!(await this.actorResolver.matchesCurrentUser(firstStep, user))) throw new ForbiddenException();

    const fields = firstStep.formDefinition?.fields ?? [];
    const titleField = fields.find((f) => f.label.toLowerCase() === 'title') ?? fields[0];
    const title = (titleField && fieldValues[String(titleField.id)]?.trim()) || `${requestType.name} request`;

    const now = new Date();
    const request = await this.prisma.db.request.create({
      data: {
        code: `REQ-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
        title,
        requester: user.email,
        requestTypeId: requestType.id,
        workflowDefinitionId: wf.id,
        currentStepId: firstStep.id,
        currentStepEnteredAt: now,
        status: 'Draft',
        metaCreatedBy: user.userId,
      },
    });

    await this.saveFieldValues(request.id, fields, fieldValues, user.userId);
    await this.engine.execute(request.id, 'Submit', user.email, null);

    return { id: request.id };
  }

  // taskId scopes the value to one specific Task instead of the whole request — only passed when
  // the current step fans a Task out per person (PerPerson), so each gatekeeper's own form answer
  // (e.g. "Căn cứ quyết định") stays independent instead of the last submitter silently
  // overwriting everyone else's. Every other step (single actor, or OneForStep) keeps the
  // pre-existing shared-per-request row (taskId: null), unchanged.
  private async saveFieldValues(requestId: number, fields: Array<{ id: number }>, values: Record<string, string>, userId: number, taskId?: number) {
    for (const field of fields) {
      const value = values[String(field.id)];
      if (value === undefined) continue;
      const existing = await this.prisma.db.requestFieldValue.findFirst({ where: { requestId, fieldId: field.id, taskId: taskId ?? null } });
      if (existing) {
        await this.prisma.db.requestFieldValue.update({ where: { id: existing.id }, data: { value, metaUpdatedAt: new Date(), metaUpdatedBy: userId } });
      } else {
        await this.prisma.db.requestFieldValue.create({ data: { requestId, fieldId: field.id, taskId, value, metaCreatedBy: userId } });
      }
    }
  }

  private async loadRequest(id: number) {
    const request = await this.prisma.db.request.findFirst({
      where: { id },
      include: {
        currentStep: {
          include: {
            gatekeepers: { where: { metaIsDeleted: false } },
            formDefinition: { include: { fields: { where: { metaIsDeleted: false }, orderBy: { orderIndex: 'asc' } } } },
          },
        },
        requestType: true,
        workflowDefinition: true,
      },
    });
    if (!request) throw new NotFoundException();
    return request;
  }

  async getDetail(user: CurrentUserPayload, id: number) {
    const request = await this.loadRequest(id);

    if (!this.isAdmin(user)) {
      const histories = await this.prisma.db.requestHistory.findMany({ where: { requestId: id } });
      const visible = await this.filterVisible([{ currentStepId: request.currentStepId, histories }], user);
      if (visible.length === 0) throw new ForbiddenException("You don't have access to that request.");
    }

    const steps = await this.stepsForDisplay(request.workflowDefinitionId);
    const currentIndex = request.currentStepId == null ? steps.length : steps.findIndex((s) => s.id === request.currentStepId);

    // Personnel sidebar: the requester, plus whoever each step's "who acts" actually names —
    // resolvable User-type actors and ApprovalGate gatekeepers (Role/Tag/Dynamic steps aren't tied
    // to a specific person, so they're left out rather than shown with a vague label).
    const allUsers = await this.prisma.db.user.findMany();
    const allUsersById = new Map(allUsers.map((u) => [u.id, u]));
    const personnel: Array<{ name: string; role: string }> = [{ name: request.requester, role: 'Requester' }];
    for (const s of steps) {
      if (s.type === 'ApprovalGate') {
        for (const g of s.gatekeepers) {
          personnel.push({ name: allUsersById.get(g.userId)?.email ?? '—', role: `${s.name} · ${g.function}` });
        }
      } else if (s.actorType === 'User' && s.actorRef?.trim()) {
        for (const email of s.actorRef.split(',').map((e) => e.trim()).filter(Boolean)) {
          personnel.push({ name: email, role: s.name });
        }
      }
    }

    const availableActions = await this.engine.getAvailableActions(request.currentStepId);
    // Matches act()'s gate: holding an Open Task is sufficient on its own (covers escalateTo/
    // admin-fallback assignees matchesCurrentUser doesn't know about), matchesCurrentUser is the
    // fallback for anyone matched but not yet holding a Task.
    const canAct =
      request.currentStepId != null &&
      (this.isAdmin(user) ||
        (await this.prisma.db.task.findFirst({
          where: { requestId: id, stepId: request.currentStepId, assigneeId: user.userId, status: 'Open' },
        })) != null ||
        (await this.actorResolver.matchesCurrentUser(request.currentStep!, user, request)));

    // taskId: null only — a PerPerson step's per-task answers don't have one "the" value to show
    // here (that's what the task's own sibling-task table and per-task form are for); the
    // aggregate request view only ever shows the shared, single-actor-step kind of answer.
    const fieldValueRows = await this.prisma.db.requestFieldValue.findMany({ where: { requestId: id, taskId: null } });
    const fieldValues: Record<number, string> = {};
    for (const fv of fieldValueRows) fieldValues[fv.fieldId] = fv.value;

    let gatekeeperApprovals: any[] | undefined;
    let alreadyVotedWaiting = false;
    let notYourTurn = false;
    let waitingOnEmail: string | undefined;

    const activeGatekeepers = request.currentStep?.gatekeepers ?? [];
    if (request.currentStep?.type === 'ApprovalGate' && activeGatekeepers.length > 1 && request.currentStepId != null) {
      // Scoped to *this visit* — a Task from a prior Return-then-resubmit cycle to this same step
      // doesn't count (task-mo-ta-cho-dev.html rule 3: "chữ ký vòng trước không còn giá trị").
      const sinceEnteredAt = request.currentStepEnteredAt ?? request.metaCreatedAt;
      const tasks = await this.prisma.db.task.findMany({
        where: { requestId: id, stepId: request.currentStepId, metaCreatedAt: { gte: sinceEnteredAt } },
        orderBy: { id: 'asc' },
      });
      const users = await this.prisma.db.user.findMany();
      const usersById = new Map(users.map((u) => [u.id, u]));

      gatekeeperApprovals = tasks.map((t) => ({
        email: usersById.get(t.assigneeId)?.email,
        function: t.function ?? '—',
        approved: t.status === 'Approved',
        approvedAt: t.status !== 'Open' ? t.metaUpdatedAt : null,
        comment: t.comment,
      }));

      const myTask = tasks.find((t) => t.assigneeId === user.userId);
      alreadyVotedWaiting = !this.isAdmin(user) && !!myTask && myTask.status !== 'Open';

      if (request.currentStep.sequentialApproval) {
        const openTask = tasks.find((t) => t.status === 'Open');
        notYourTurn = !this.isAdmin(user) && activeGatekeepers.some((g) => g.userId === user.userId) && openTask?.assigneeId !== user.userId;
        waitingOnEmail = openTask ? usersById.get(openTask.assigneeId)?.email : undefined;
      }
    }

    const histories = await this.prisma.db.requestHistory.findMany({
      where: { requestId: id },
      orderBy: { metaCreatedAt: 'asc' },
    });

    const attachments = await this.buildAttachments(id, steps, fieldValueRows);

    return {
      id: request.id,
      code: request.code,
      title: request.title,
      requester: request.requester,
      status: request.status,
      currentStep: request.currentStep,
      steps,
      personnel,
      currentIndex,
      availableActions,
      canAct,
      fieldValues,
      gatekeeperApprovals,
      alreadyVotedWaiting,
      notYourTurn,
      waitingOnEmail,
      histories,
      attachments,
    };
  }

  // Every FileUpload field's submitted value across the whole request, regardless of which step
  // collected it — ports RequestController.BuildAttachmentList. Size is read from the actual file
  // on disk since it isn't stored anywhere; "added by" resolves the field value's metaCreatedBy.
  private async buildAttachments(
    requestId: number,
    steps: Array<{ id: number; name: string }>,
    fieldValueRows: Array<{ fieldId: number; value: string; metaCreatedAt: Date; metaCreatedBy: number | null }>,
  ) {
    const valuesByFieldId = new Map(fieldValueRows.map((v) => [v.fieldId, v]));
    const users = await this.prisma.db.user.findMany();
    const usersById = new Map(users.map((u) => [u.id, u]));

    const attachments: Array<{
      fileName: string;
      type: string;
      size: string;
      addedBy: string;
      addedAt: Date;
      stepName: string;
      url: string;
    }> = [];

    for (const step of steps) {
      const stepWithForm = await this.prisma.db.step.findFirst({
        where: { id: step.id },
        include: { formDefinition: { include: { fields: { where: { metaIsDeleted: false, type: 'FileUpload' } } } } },
      });
      for (const field of stepWithForm?.formDefinition?.fields ?? []) {
        const fv = valuesByFieldId.get(field.id);
        if (!fv || !fv.value?.trim()) continue;

        const rawName = fv.value.split('/').pop() ?? fv.value;
        const fileName = rawName.includes('_') ? rawName.split('_').slice(1).join('_') : rawName;
        const ext = fileName.includes('.') ? fileName.split('.').pop()!.toUpperCase() : 'FILE';

        let size = '—';
        try {
          const stat = fs.statSync(path.join(process.cwd(), fv.value.replace(/^\//, '')));
          size = formatFileSize(stat.size);
        } catch {
          // file missing on disk — leave size as "—" rather than failing the whole request
        }

        attachments.push({
          fileName,
          type: ext || 'FILE',
          size,
          addedBy: fv.metaCreatedBy != null ? usersById.get(fv.metaCreatedBy)?.email ?? '—' : '—',
          addedAt: fv.metaCreatedAt,
          stepName: step.name,
          url: fv.value,
        });
      }
    }

    return attachments.sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  }

  async act(user: CurrentUserPayload, id: number, action: TransitionAction, comment: string | undefined, fieldValues: Record<string, string> | undefined) {
    const request = await this.loadRequest(id);
    if (request.currentStepId == null) {
      throw new ForbiddenException("You're not the \"who acts\" for the current step, so you can't act on this request.");
    }

    const actorId = user.email;
    const trimmedComment = comment?.trim() || null;
    const admin = this.isAdmin(user);
    const stepId = request.currentStepId;

    // Return/Reject require a comment (task-mo-ta-cho-dev.html screen B legend: "Trả về và huỷ
    // luôn bắt buộc có nhận xét") — whoever gets sent back or terminated needs to know why, not
    // just that it happened. Applies to admin too; this is a record-quality rule, not a permission
    // gate the admin bypass is meant to skip.
    if ((action === 'Return' || action === 'Reject') && !trimmedComment) {
      throw new BadRequestException(`A comment is required to ${action.toLowerCase()} this request.`);
    }

    // Every permission check here is server-side (rule 5) — a hidden/disabled button client-side
    // is convenience only. Admin bypasses task bookkeeping entirely and forces the transition
    // directly, same as before this rewrite: their action was never gated on holding a vote.
    // Holding an Open Task is authorization on its own, and is now the *only* gate — it's strictly
    // more precise than the old matchesCurrentUser check, since it also covers actors
    // matchesCurrentUser has no way to know about (an escalateTo recipient, an admin-fallback
    // assignee), given Tasks are only ever spawned for someone the engine actually resolved.
    const myTask = admin
      ? null
      : await this.prisma.db.task.findFirst({ where: { requestId: id, stepId, assigneeId: user.userId, status: 'Open' } });
    if (!admin && !myTask) {
      throw new ForbiddenException('You do not currently hold an open task for this step.');
    }
    // Step 0 is exempt — the requester acting on their own Submit step is the intended actor
    // there (matchesCurrentUser's own orderIndex===0 special case), not a self-approval conflict.
    if (!admin && action === 'Approve' && myTask && request.currentStep!.orderIndex !== 0 && request.metaCreatedBy === user.userId) {
      throw new ForbiddenException("You created this request, so you can't approve it yourself — it's been escalated instead.");
    }

    if (request.currentStep!.formDefinitionId && fieldValues) {
      const perTaskAnswers = !admin && myTask && request.currentStep!.taskFanOutMode !== 'OneForStep';
      await this.saveFieldValues(id, request.currentStep!.formDefinition?.fields ?? [], fieldValues, user.userId, perTaskAnswers ? myTask!.id : undefined);
    }

    if (admin) {
      await this.engine.execute(id, action, actorId, trimmedComment);
      return { ok: true };
    }

    const CLOSE_STATUS: Partial<Record<TransitionAction, string>> = { Approve: 'Approved', Submit: 'Approved', Reject: 'Rejected', Return: 'Returned' };
    const closeStatus = CLOSE_STATUS[action];
    if (closeStatus && myTask) {
      await this.prisma.db.task.update({
        where: { id: myTask.id },
        data: { status: closeStatus, comment: trimmedComment, metaUpdatedAt: new Date() },
      });
    }

    // Reject/Return short-circuit immediately (a single one sends the request away right now,
    // same as before) — only the "advance" actions (Approve/Submit) wait on resolutionRule.
    const isAdvanceAction = action === 'Approve' || action === 'Submit';
    if (!isAdvanceAction) {
      await this.engine.execute(id, action, actorId, trimmedComment);
      return { ok: true };
    }

    const sinceEnteredAt = request.currentStepEnteredAt ?? request.metaCreatedAt;
    const tasks = await this.prisma.db.task.findMany({ where: { requestId: id, stepId, metaCreatedAt: { gte: sinceEnteredAt } } });
    const required = tasks.filter((t) => t.requiredForResolution);
    const approvedCount = required.filter((t) => t.status === 'Approved').length;
    const openRequiredCount = required.filter((t) => t.status === 'Open').length;

    const resolutionRule = request.currentStep!.resolutionRule;
    // Sequential mode only ever has one Open required task at a time (the next person's task is
    // spawned progressively, not all upfront) — so "no required task is currently Open" is true
    // after every single approval, not just the last one. 'All' is only really satisfied once
    // nobody's left in the roster to hand the next task to.
    const rosterExhausted = async () =>
      (await this.actorResolver.resolveStepRecipients(id, request.currentStep!, sinceEnteredAt)).length === 0;
    const satisfied =
      resolutionRule === 'Any'
        ? approvedCount >= 1
        : resolutionRule === 'Quorum'
        ? approvedCount >= (request.currentStep!.quorumCount ?? required.length)
        : openRequiredCount === 0 && (!request.currentStep!.sequentialApproval || (await rosterExhausted())); // 'All' (default)

    if (satisfied) {
      await this.engine.execute(id, action, actorId, trimmedComment);
      return { ok: true };
    }

    if (request.currentStep!.sequentialApproval) {
      await this.engine.spawnNextSequentialTask(id, stepId);
    }

    const totalRequired = request.currentStep!.sequentialApproval
      ? request.currentStep!.gatekeepers.filter((g) => g.userId !== request.metaCreatedBy).length
      : required.length;
    return {
      notice: `Your ${action.toLowerCase()} was recorded (${approvedCount}/${totalRequired} required so far) — waiting on the others before this moves forward.`,
    };
  }

  async remove(user: CurrentUserPayload, id: number) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Only admins can remove requests.');
    await this.prisma.db.request.update({ where: { id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date(), metaUpdatedBy: user.userId } });
    // Tasks don't cascade off their parent Request automatically (the soft-delete filter only
    // looks at a row's own metaIsDeleted) — without this, a removed request's still-Open tasks
    // would keep showing up in everyone's My Tasks inbox forever.
    await this.prisma.db.task.updateMany({ where: { requestId: id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date(), metaUpdatedBy: user.userId } });
  }

  async exportCsv(user: CurrentUserPayload, q?: string, requestTypeId?: number, status?: string) {
    const { items } = await this.list(user, q, requestTypeId, status, 1);
    // list() paginates — export walks every page so the CSV isn't silently truncated to page 1.
    const all: typeof items = [];
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.list(user, q, requestTypeId, status, page);
      all.push(...result.items);
      if (page >= result.totalPages) break;
      page++;
    }

    const header = 'Code,Title,Type,Requester,CurrentStep,Status,CreatedAt';
    const escape = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = all.map((r) =>
      [r.code, escape(r.title), escape(r.requestTypeName), escape(r.requester), escape(r.currentStepName ?? ''), r.status, new Date(r.createdAt).toISOString()].join(','),
    );
    return [header, ...rows].join('\n');
  }
}
