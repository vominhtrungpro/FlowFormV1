import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowEngineService } from '../workflow-engine/workflow-engine.service';
import { RequestsService } from '../requests/requests.service';
import { CurrentUserPayload } from '../common/current-user.decorator';
import { TransitionAction } from '../common/enums';

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private engine: WorkflowEngineService,
    private requests: RequestsService,
  ) {}

  // Acting on a task is the same "close the task, re-check resolutionRule, maybe advance" logic
  // as /api/requests/:id/actions — RequestsService.act() already re-derives "my open task for
  // this request's current step" from (requestId, userId), which is exactly this task whenever
  // it's still the live one, so this just resolves the task's requestId and reuses it rather than
  // duplicating the whole engine dance.
  async actOnTask(user: CurrentUserPayload, taskId: number, action: TransitionAction, comment: string | undefined, fieldValues: Record<string, string> | undefined) {
    const task = await this.prisma.db.task.findFirst({ where: { id: taskId } });
    if (!task) throw new NotFoundException();
    return this.requests.act(user, task.requestId, action, comment, fieldValues);
  }

  // Delegation moves who holds the task, never the deadline (task-mo-ta-cho-dev.html rule 4) —
  // if dueAt reset here, delegating would become a legitimate way to dodge a deadline.
  // originalAssigneeId is stamped only the first time a task is delegated, so a chain of
  // delegations still points back to who it truly started with.
  async delegate(taskId: number, actingUser: CurrentUserPayload, newAssigneeId: number) {
    const task = await this.prisma.db.task.findFirst({ where: { id: taskId } });
    if (!task) throw new NotFoundException();

    const isAdmin = actingUser.role.toLowerCase() === 'admin';
    if (!isAdmin && task.assigneeId !== actingUser.userId) {
      throw new ForbiddenException('Only the current holder of this task can delegate it.');
    }
    if (task.status !== 'Open') {
      throw new BadRequestException('Only an open task can be delegated.');
    }

    const newAssignee = await this.prisma.db.user.findFirst({ where: { id: newAssigneeId } });
    if (!newAssignee) throw new BadRequestException('That user does not exist.');

    // "Cùng phòng ban" from the mock's assumption table — FlowForm has no department field, so
    // this reads "same team" as sharing the current holder's `tag` (the same stand-in "My team"
    // tab uses). Enforced here, not just filtered out of delegateCandidates, per rule 5.
    if (!isAdmin) {
      const currentHolder = await this.prisma.db.user.findFirst({ where: { id: task.assigneeId } });
      if (currentHolder && newAssignee.tag !== currentHolder.tag) {
        throw new ForbiddenException(`You can only delegate within your own team (${currentHolder.tag}).`);
      }
    }

    const updated = await this.prisma.db.task.update({
      where: { id: taskId },
      data: {
        originalAssigneeId: task.originalAssigneeId ?? task.assigneeId,
        assigneeId: newAssigneeId,
        metaUpdatedAt: new Date(),
      },
    });

    const request = await this.prisma.db.request.findFirst({ where: { id: task.requestId } });
    const step = await this.prisma.db.step.findFirst({ where: { id: task.stepId } });
    if (request && step) await this.notifications.notifyTaskAssigned(request, updated, step);

    return updated;
  }

  // The mock's "Delegated by me" tab shows a revoke button next to anything still open — only the
  // person who originally held the task (not just whoever currently does, in case of a
  // delegation chain) can pull it back, and only while it's still Open.
  async revokeDelegation(taskId: number, actingUser: CurrentUserPayload) {
    const task = await this.prisma.db.task.findFirst({ where: { id: taskId } });
    if (!task) throw new NotFoundException();

    const isAdmin = actingUser.role.toLowerCase() === 'admin';
    if (task.originalAssigneeId == null) {
      throw new BadRequestException("This task hasn't been delegated.");
    }
    if (!isAdmin && task.originalAssigneeId !== actingUser.userId) {
      throw new ForbiddenException('Only the person who delegated this task can revoke it.');
    }
    if (task.status !== 'Open') {
      throw new BadRequestException('Only an open task can be revoked.');
    }

    const updated = await this.prisma.db.task.update({
      where: { id: taskId },
      data: { assigneeId: task.originalAssigneeId, originalAssigneeId: null, metaUpdatedAt: new Date() },
    });

    const request = await this.prisma.db.request.findFirst({ where: { id: task.requestId } });
    const step = await this.prisma.db.step.findFirst({ where: { id: task.stepId } });
    if (request && step) await this.notifications.notifyTaskAssigned(request, updated, step);

    return updated;
  }

  // "Overdue / due today / next 3 days / later" is computed here at read time from dueAt, never
  // stored (rule 6) — a closed task or one with no SLA configured has no bucket at all.
  private dueBucket(dueAt: Date | null, status: string, now: Date): string {
    if (status !== 'Open' || dueAt == null) return 'none';
    const diffMs = dueAt.getTime() - now.getTime();
    if (diffMs < 0) return 'overdue';
    if (diffMs < DAY_MS) return 'dueToday';
    if (diffMs < 3 * DAY_MS) return 'next3Days';
    return 'later';
  }

  // Four tabs, matching the mock: Assigned to me / Delegated by me / Completed / My team.
  // "My team" has no org-chart in FlowForm to draw on — this reads "team" as "shares my tag"
  // (the same free-text field used elsewhere as a lightweight role/group label), which is a
  // simplification worth revisiting if a real team concept gets added later.
  async listMine(user: CurrentUserPayload, tab: string, page: number) {
    const now = new Date();
    let where: any;

    if (tab === 'delegated') {
      where = { originalAssigneeId: user.userId, NOT: { assigneeId: user.userId } };
    } else if (tab === 'completed') {
      where = { assigneeId: user.userId, status: { in: ['Approved', 'Rejected', 'Returned'] } };
    } else if (tab === 'team') {
      const me = await this.prisma.db.user.findFirst({ where: { id: user.userId } });
      const teammateIds = (await this.prisma.db.user.findMany({ where: { tag: me?.tag ?? '__none__', NOT: { id: user.userId } } })).map((u) => u.id);
      where = { assigneeId: { in: teammateIds }, status: 'Open' };
    } else {
      where = { assigneeId: user.userId, status: 'Open' };
    }

    const all = await this.prisma.db.task.findMany({
      where,
      include: { request: true, step: true },
      orderBy: { id: 'desc' },
    });

    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const pageClamped = Math.max(1, page);
    const pageItems = all.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    const users = await this.prisma.db.user.findMany();
    const usersById = new Map(users.map((u) => [u.id, u]));

    const items = await Promise.all(
      pageItems.map(async (t) => {
        // Parallel-review progress: only shown for steps that actually fan a Task out per person
        // — a single-actor step has nothing to show progress against (mock legend A.2).
        const siblings = await this.prisma.db.task.findMany({ where: { requestId: t.requestId, stepId: t.stepId } });
        const requiredSiblings = siblings.filter((s) => s.requiredForResolution);
        const isParallel = t.step.taskFanOutMode !== 'OneForStep' && requiredSiblings.length > 1;

        return {
          id: t.id,
          code: `TSK-${t.id}`,
          requestId: t.requestId,
          requestCode: t.request.code,
          requestTitle: t.request.title,
          stepName: t.step.name,
          stepType: t.step.type,
          function: t.function,
          status: t.status,
          dueAt: t.dueAt,
          overdue: t.dueAt != null && t.status === 'Open' && now.getTime() > t.dueAt.getTime(),
          dueBucket: this.dueBucket(t.dueAt, t.status, now),
          isParallel,
          siblingProgress: isParallel ? { approved: requiredSiblings.filter((s) => s.status === 'Approved').length, total: requiredSiblings.length } : null,
          delegated: t.originalAssigneeId != null,
          delegatedFromEmail: t.originalAssigneeId != null ? usersById.get(t.originalAssigneeId)?.email : undefined,
          assigneeEmail: usersById.get(t.assigneeId)?.email,
          reason: t.reason,
          canRevoke: tab === 'delegated' && t.status === 'Open',
        };
      }),
    );

    return { page: pageClamped, totalPages, items };
  }

  async getDetail(user: CurrentUserPayload, taskId: number) {
    const task = await this.prisma.db.task.findFirst({
      where: { id: taskId },
      include: {
        request: true,
        step: {
          include: {
            formDefinition: { include: { fields: { where: { metaIsDeleted: false }, orderBy: { orderIndex: 'asc' } } } },
          },
        },
      },
    });
    if (!task) throw new NotFoundException();

    const isAdmin = user.role.toLowerCase() === 'admin';
    if (!isAdmin && task.assigneeId !== user.userId && task.originalAssigneeId !== user.userId) {
      throw new ForbiddenException("This task isn't assigned to you.");
    }

    // Scoped to this visit, same as the request-detail gatekeeper table — a sibling task from a
    // prior Return-then-resubmit cycle to this step doesn't belong in the current picture.
    const sinceEnteredAt = task.request.currentStepEnteredAt ?? task.request.metaCreatedAt;
    const siblingTasks = await this.prisma.db.task.findMany({
      where: { requestId: task.requestId, stepId: task.stepId, metaCreatedAt: { gte: sinceEnteredAt } },
      orderBy: { id: 'asc' },
    });

    const users = await this.prisma.db.user.findMany();
    const usersById = new Map(users.map((u) => [u.id, u]));

    // On a PerPerson step, this task's own answer (taskId: task.id) takes precedence over the
    // shared row for the same field — everyone else's forms are read-only/blank to this viewer
    // either way (rule: this screen only ever shows/edits *your* task's own state).
    const fields = task.step.formDefinition?.fields ?? [];
    const fieldIds = fields.map((f) => f.id);
    const fieldValueRows = await this.prisma.db.requestFieldValue.findMany({
      where: { requestId: task.requestId, fieldId: { in: fieldIds }, OR: [{ taskId: task.id }, { taskId: null }] },
    });
    const fieldValues: Record<number, string> = {};
    for (const fv of fieldValueRows.filter((fv) => fv.taskId == null)) fieldValues[fv.fieldId] = fv.value;
    for (const fv of fieldValueRows.filter((fv) => fv.taskId === task.id)) fieldValues[fv.fieldId] = fv.value;

    // Conditions are generic and config-driven — required fields on the step's own form (which
    // genuinely block *this* task's own Approve, blocksAction: true), and, for a fanned-out step,
    // how many of the *other* required sibling tasks have closed (informational only,
    // blocksAction: false — gating Approve on siblings having already answered would mean nobody
    // could ever go first, since that condition is unmet for every gatekeeper until the last one
    // acts; resolutionRule already re-checks this the moment any task closes, engine-side).
    const requiredFields = fields.filter((f) => f.required);
    const requiredSiblings = siblingTasks.filter((t) => t.requiredForResolution);
    const otherOpenRequiredSiblings = requiredSiblings.filter((t) => t.id !== task.id && t.status === 'Open');
    const conditions = requiredFields.map((f) => ({ label: `"${f.label}" is filled in`, met: !!fieldValues[f.id]?.trim(), blocksAction: true }));
    if (requiredSiblings.length > 1) {
      conditions.push({
        label: `All ${requiredSiblings.length} required task(s) on this step have responded`,
        met: otherOpenRequiredSiblings.length === 0,
        blocksAction: false,
      });
    }

    const canAct = (isAdmin || task.assigneeId === user.userId) && task.status === 'Open';

    return {
      id: task.id,
      code: `TSK-${task.id}`,
      status: task.status,
      requestId: task.requestId,
      requestCode: task.request.code,
      requestTitle: task.request.title,
      stepId: task.stepId,
      stepName: task.step.name,
      stepType: task.step.type,
      function: task.function,
      reason: task.reason,
      dueAt: task.dueAt,
      comment: task.comment,
      cancelReason: task.cancelReason,
      canAct,
      canDelegate: canAct,
      availableActions: canAct ? await this.engine.getAvailableActions(task.stepId) : [],
      conditions,
      siblingTasks: siblingTasks.map((t) => ({
        id: t.id,
        code: `TSK-${t.id}`,
        function: t.function,
        assigneeEmail: usersById.get(t.assigneeId)?.email,
        status: t.status,
        requiredForResolution: t.requiredForResolution,
        comment: t.comment,
      })),
      formFields: fields,
      fieldValues,
      escalateTo: task.step.escalateTo,
      slaValue: task.step.slaValue,
      slaUnit: task.step.slaUnit,
      // Same-team-only, matching delegate()'s own enforcement (rule 5) — admin isn't exempt here
      // either, since admin already has other ways to intervene if a real cross-team handoff is
      // ever needed.
      delegateCandidates: users
        .filter((u) => u.id !== task.assigneeId && u.tag === usersById.get(task.assigneeId)?.tag)
        .map((u) => ({ id: u.id, email: u.email })),
    };
  }
}
