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

  private async saveFieldValues(requestId: number, fields: Array<{ id: number }>, values: Record<string, string>, userId: number) {
    for (const field of fields) {
      const value = values[String(field.id)];
      if (value === undefined) continue;
      const existing = await this.prisma.db.requestFieldValue.findFirst({ where: { requestId, fieldId: field.id } });
      if (existing) {
        await this.prisma.db.requestFieldValue.update({ where: { id: existing.id }, data: { value, metaUpdatedAt: new Date(), metaUpdatedBy: userId } });
      } else {
        await this.prisma.db.requestFieldValue.create({ data: { requestId, fieldId: field.id, value, metaCreatedBy: userId } });
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

  // Ports RequestController.AutoAdvanceFullyApprovedSteps: guards against a request landing back
  // on an ApprovalGate (via Return) where every currently-assigned gatekeeper already voted before
  // — nobody would be left who can click Approve, so the system auto-advances it instead.
  private async autoAdvanceFullyApprovedSteps(id: number) {
    for (let i = 0; i < 10; i++) {
      const request = await this.loadRequest(id);
      const gatekeepers = request.currentStep?.gatekeepers ?? [];
      if (request.currentStep?.type !== 'ApprovalGate' || gatekeepers.length <= 1) return;

      const votedUserIds = new Set(
        (await this.prisma.db.stepApproval.findMany({ where: { requestId: id, stepId: request.currentStepId! } })).map((a) => a.userId),
      );
      if (!gatekeepers.every((g) => votedUserIds.has(g.userId))) return;

      await this.engine.execute(id, 'Approve', 'system', 'Auto-advanced — every gatekeeper on this step had already approved this request.');
    }
  }

  async getDetail(user: CurrentUserPayload, id: number) {
    await this.autoAdvanceFullyApprovedSteps(id);
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
    const canAct = request.currentStepId != null && (await this.actorResolver.matchesCurrentUser(request.currentStep!, user, request));

    const fieldValueRows = await this.prisma.db.requestFieldValue.findMany({ where: { requestId: id } });
    const fieldValues: Record<number, string> = {};
    for (const fv of fieldValueRows) fieldValues[fv.fieldId] = fv.value;

    let gatekeeperApprovals: any[] | undefined;
    let alreadyVotedWaiting = false;
    let notYourTurn = false;
    let waitingOnEmail: string | undefined;

    const activeGatekeepers = request.currentStep?.gatekeepers ?? [];
    if (request.currentStep?.type === 'ApprovalGate' && activeGatekeepers.length > 1) {
      const votes = await this.prisma.db.stepApproval.findMany({ where: { requestId: id, stepId: request.currentStepId! } });
      const votesByUserId = new Map(votes.map((v) => [v.userId, v]));
      const users = await this.prisma.db.user.findMany();
      const usersById = new Map(users.map((u) => [u.id, u]));

      gatekeeperApprovals = activeGatekeepers
        .sort((a, b) => a.id - b.id)
        .map((g) => {
          const vote = votesByUserId.get(g.userId);
          return {
            email: usersById.get(g.userId)?.email,
            function: g.function,
            approved: !!vote,
            approvedAt: vote?.metaCreatedAt ?? null,
            comment: vote?.comment ?? null,
          };
        });

      alreadyVotedWaiting = !this.isAdmin(user) && votesByUserId.has(user.userId);

      if (request.currentStep.sequentialApproval) {
        const ordered = [...activeGatekeepers].sort((a, b) => a.id - b.id);
        const nextUp = ordered.find((g) => !votesByUserId.has(g.userId));
        notYourTurn = !this.isAdmin(user) && !!nextUp && nextUp.userId !== user.userId && !votesByUserId.has(user.userId);
        waitingOnEmail = nextUp ? usersById.get(nextUp.userId)?.email : undefined;
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
    if (request.currentStepId == null || !(await this.actorResolver.matchesCurrentUser(request.currentStep!, user, request))) {
      throw new ForbiddenException("You're not the \"who acts\" for the current step, so you can't act on this request.");
    }

    const actorId = user.email;
    const trimmedComment = comment?.trim() || null;

    if (request.currentStep!.formDefinitionId && fieldValues) {
      await this.saveFieldValues(id, request.currentStep!.formDefinition?.fields ?? [], fieldValues, user.userId);
    }

    const activeGatekeepers = [...(request.currentStep?.gatekeepers ?? [])].sort((a, b) => a.id - b.id);
    const isMultiGatekeeperGate = request.currentStep?.type === 'ApprovalGate' && activeGatekeepers.length > 1;
    const admin = this.isAdmin(user);

    if (isMultiGatekeeperGate && request.currentStep!.sequentialApproval && !admin) {
      const votedIds = new Set(
        (await this.prisma.db.stepApproval.findMany({ where: { requestId: id, stepId: request.currentStepId } })).map((a) => a.userId),
      );
      const nextUp = activeGatekeepers.find((g) => !votedIds.has(g.userId));
      if (nextUp && nextUp.userId !== user.userId) {
        const nextUser = await this.prisma.db.user.findFirst({ where: { id: nextUp.userId } });
        throw new BadRequestException(`It's not your turn to act yet — waiting on ${nextUser?.email} first.`);
      }
    }

    const needsConsensus = action === 'Approve' && isMultiGatekeeperGate && !admin;

    if (needsConsensus) {
      const votedIds = new Set(
        (await this.prisma.db.stepApproval.findMany({ where: { requestId: id, stepId: request.currentStepId } })).map((a) => a.userId),
      );
      const alreadyVoted = votedIds.has(user.userId);

      if (!alreadyVoted) {
        await this.prisma.db.stepApproval.create({
          data: { requestId: id, stepId: request.currentStepId!, userId: user.userId, comment: trimmedComment },
        });
      }

      const votedUserIds = new Set(
        (await this.prisma.db.stepApproval.findMany({ where: { requestId: id, stepId: request.currentStepId } })).map((a) => a.userId),
      );

      if (!activeGatekeepers.every((g) => votedUserIds.has(g.userId))) {
        if (!alreadyVoted) {
          await this.prisma.db.requestHistory.create({
            data: {
              requestId: id,
              stepId: request.currentStepId,
              action,
              actorId,
              fromStepId: request.currentStepId,
              toStepId: request.currentStepId,
              comment: trimmedComment,
            },
          });

          if (request.currentStep!.sequentialApproval) {
            const nextUp = activeGatekeepers.find((g) => !votedUserIds.has(g.userId));
            if (nextUp) await this.notifications.notifyNextGatekeeper(request, request.currentStep!, nextUp.userId);
          }
        }

        return {
          notice: `Your approval was recorded (${votedUserIds.size}/${activeGatekeepers.length} gatekeepers so far) — waiting on the others before this moves forward.`,
        };
      }
    }

    await this.engine.execute(id, action, actorId, trimmedComment);
    return { ok: true };
  }

  async remove(user: CurrentUserPayload, id: number) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Only admins can remove requests.');
    await this.prisma.db.request.update({ where: { id }, data: { metaIsDeleted: true, metaUpdatedAt: new Date(), metaUpdatedBy: user.userId } });
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
