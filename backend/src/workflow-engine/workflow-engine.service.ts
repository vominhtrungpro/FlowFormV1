import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConditionEvaluatorService } from '../condition-evaluator/condition-evaluator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActorResolverService } from '../common/actor-resolver.service';
import { computeDueAt } from '../sla/sla-calculator';
import { TransitionAction, SlaUnit } from '../common/enums';

// Ports FlowFormDemo/Services/WorkflowEngine.cs — the single chokepoint every Submit/Approve/
// Return/Reject/Complete transition flows through, including the auto-route-through-Condition-
// steps loop, Task lifecycle (spawn on arrival, cancel on departure), and the post-transition
// notification hook.
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private prisma: PrismaService,
    private conditionEvaluator: ConditionEvaluatorService,
    private notifications: NotificationsService,
    private actorResolver: ActorResolverService,
  ) {}

  async getAvailableActions(currentStepId: number | null) {
    if (currentStepId == null || (await this.isConditionStep(currentStepId))) return [];
    return this.prisma.db.transition.findMany({ where: { fromStepId: currentStepId } });
  }

  async findTransition(fromStepId: number, action: TransitionAction) {
    if (await this.isConditionStep(fromStepId)) return null;
    return this.prisma.db.transition.findFirst({ where: { fromStepId, action } });
  }

  private async isConditionStep(stepId: number): Promise<boolean> {
    const step = await this.prisma.db.step.findFirst({ where: { id: stepId } });
    return step?.type === 'Condition';
  }

  async execute(requestId: number, action: TransitionAction, actorId: string, comment: string | null) {
    const request = await this.prisma.db.request.findFirst({ where: { id: requestId } });
    if (!request || request.currentStepId == null) {
      throw new BadRequestException(`Action '${action}' is not allowed from the current step.`);
    }

    const transition = await this.findTransition(request.currentStepId, action);
    if (!transition) {
      throw new BadRequestException(`Action '${action}' is not allowed from the current step.`);
    }

    const toStepId = transition.toStepId;
    const leavingStepId = request.currentStepId;

    await this.prisma.db.requestHistory.create({
      data: {
        requestId: request.id,
        stepId: request.currentStepId,
        action,
        actorId,
        fromStepId: request.currentStepId,
        toStepId,
        comment,
      },
    });

    // The request is leaving leavingStepId no matter what toStepId turns out to be (even "the
    // request just ended") — any Task still Open there has no reason left to exist (rule 3).
    await this.cancelOpenTasksForStep(requestId, leavingStepId, `Step advanced (${action})`);

    const now = new Date();
    let status: string;
    let completedAt: Date | null = null;
    if (toStepId == null) {
      status = action === 'Reject' ? 'Terminated' : 'Completed';
      completedAt = now;
    } else if (action === 'Return') {
      status = 'Returned';
    } else {
      status = 'InProgress';
    }

    await this.prisma.db.request.update({
      where: { id: request.id },
      data: {
        currentStepId: toStepId,
        currentStepEnteredAt: toStepId != null ? now : null,
        status,
        completedAt,
      },
    });

    const finalStepId = await this.autoRouteThroughConditionSteps(request.id, toStepId);
    if (finalStepId != null) await this.spawnTasksForStep(request.id, finalStepId, new Date());
    await this.notifyForLanding(request.id, action, finalStepId);
  }

  // Landing on a Condition step is never a stopping point for a human — walk through as many
  // consecutive Condition steps as the rules dictate. Cycle detection (a designer mistake) refuses
  // to visit the same Condition step twice, terminating the request instead of spinning forever.
  private async autoRouteThroughConditionSteps(requestId: number, startStepId: number | null): Promise<number | null> {
    let stepId = startStepId;
    const visited = new Set<number>();

    while (stepId != null) {
      const step = await this.prisma.db.step.findFirst({
        where: { id: stepId },
        include: { conditionRulesOf: { where: { metaIsDeleted: false } } },
      });
      if (!step || step.type !== 'Condition') return stepId;

      if (visited.has(step.id)) {
        await this.prisma.db.requestHistory.create({
          data: {
            requestId,
            stepId: step.id,
            action: 'AutoRoute',
            actorId: 'system',
            fromStepId: step.id,
            toStepId: null,
            comment: `Auto-routing stopped: step "${step.name}" is part of a routing cycle.`,
          },
        });
        await this.prisma.db.request.update({
          where: { id: requestId },
          data: { currentStepId: null, currentStepEnteredAt: null, status: 'Terminated', completedAt: new Date() },
        });
        return null;
      }
      visited.add(step.id);

      // taskId: null — a field from a PerPerson step has one row per gatekeeper, not one true
      // value, so it can't deterministically feed a Condition rule; only single-actor-step fields
      // (the realistic case for anything a Condition step would reference) resolve here.
      const fieldValues = await this.prisma.db.requestFieldValue.findMany({ where: { requestId, taskId: null } });
      const valuesByFieldId: Record<number, string> = {};
      for (const fv of fieldValues) valuesByFieldId[fv.fieldId] = fv.value;

      const resolvedToStepId = this.conditionEvaluator.resolve(step as any, valuesByFieldId);

      await this.prisma.db.requestHistory.create({
        data: { requestId, stepId: step.id, action: 'AutoRoute', actorId: 'system', fromStepId: step.id, toStepId: resolvedToStepId },
      });

      const now = new Date();
      await this.prisma.db.request.update({
        where: { id: requestId },
        data: {
          currentStepId: resolvedToStepId,
          currentStepEnteredAt: resolvedToStepId != null ? now : null,
          status: resolvedToStepId == null ? 'Completed' : 'InProgress',
          completedAt: resolvedToStepId == null ? now : undefined,
        },
      });

      stepId = resolvedToStepId;
    }
    return stepId;
  }

  // Only handles the "request ended" case now — landing on a live step is covered by
  // spawnTasksForStep's per-task notifyTaskAssigned, called just before this in execute().
  private async notifyForLanding(requestId: number, action: TransitionAction, finalStepId: number | null) {
    if (finalStepId != null) return;

    const request = await this.prisma.db.request.findFirst({ where: { id: requestId } });
    if (!request) return;

    const message =
      action === 'Reject'
        ? `Your request "${request.title}" (${request.code}) was rejected.`
        : `Your request "${request.title}" (${request.code}) is complete.`;
    await this.notifications.notifyRequester(request, message);
  }

  // Cancels every still-Open Task for (requestId, stepId) — called right before the request
  // leaves that step, whatever the reason (Return, a resolutionRule being satisfied early by
  // Any/Quorum, Reject). "Leaving a step" is one event either way, so one code path for both
  // assumption-table scenarios (early advance and Return) rather than two separate configs.
  private async cancelOpenTasksForStep(requestId: number, stepId: number, reason: string) {
    const openTasks = await this.prisma.db.task.findMany({ where: { requestId, stepId, status: 'Open' } });
    if (openTasks.length === 0) return;

    const request = await this.prisma.db.request.findFirst({ where: { id: requestId } });
    const step = await this.prisma.db.step.findFirst({ where: { id: stepId } });
    if (!request || !step) return;

    for (const task of openTasks) {
      await this.prisma.db.task.update({
        where: { id: task.id },
        data: { status: 'Cancelled', cancelReason: reason, metaUpdatedAt: new Date() },
      });
      await this.notifications.notifyTaskCancelled(request, task, step, reason);
    }
  }

  // Spawns 1..N Task rows the instant a request lands on a step (never lazily, never regenerated
  // on read — rule 1). Resolution reuses ActorResolverService.resolveStepRecipients, same list
  // notifications already used, plus the fan-out/self-approval/empty-actor handling the mock's
  // assumption table calls for.
  private async spawnTasksForStep(requestId: number, stepId: number, now: Date) {
    const step = await this.prisma.db.step.findFirst({
      where: { id: stepId },
      include: { gatekeepers: { where: { metaIsDeleted: false } } },
    });
    const request = await this.prisma.db.request.findFirst({ where: { id: requestId } });
    if (!step || !request) return;

    const recipients = await this.actorResolver.resolveStepRecipients(requestId, step, now);

    if (recipients.length === 0) {
      const admins = await this.prisma.db.user.findMany({ where: { role: 'admin' } });
      if (admins.length === 0) {
        this.logger.error(`Request ${requestId} landed on step "${step.name}" with no resolvable actor and no admin fallback available.`);
        return;
      }
      this.logger.warn(`Request ${requestId}, step "${step.name}": actor resolved to nobody — falling back to admin.`);
      for (const admin of admins) {
        await this.createTask(
          request,
          step,
          admin.id,
          now,
          'Actor could not be resolved for this step (missing/invalid configuration) — assigned to a system administrator.',
          null,
        );
      }
      return;
    }

    // Step 0 (Submit) is the one place the requester acting on their own request is the intended,
    // only-ever-correct actor — not a conflict. The self-approval lock only makes sense for later
    // approval steps the requester might also happen to be resolved into.
    const isFirstStep = step.orderIndex === 0;

    // ClaimFirst fans out exactly like PerPerson (everyone eligible gets a Task); the difference
    // is entirely in resolutionRule (forced to 'Any' by saveStep), not in who gets spawned here.
    const fanOut = step.taskFanOutMode !== 'OneForStep' ? recipients : recipients.slice(0, 1);
    for (const userId of fanOut) {
      const gatekeeper = step.gatekeepers.find((g) => g.userId === userId);
      // Requester can't approve their own request — their Task is still created (never silently
      // skip the step, and it stays visible for transparency) but is excluded from
      // resolutionRule (requiredForResolution: false) and act() rejects an Approve attempt on it
      // specifically. escalateTo is the fallback approver pool since FlowForm has no manager/
      // org-chart field to resolve "their superior" from.
      const isSelfApproval = !isFirstStep && request.metaCreatedBy === userId;
      const reason = isSelfApproval
        ? "You created this request, so this task can't be approved by you — escalated for approval instead."
        : this.describeAssignmentReason(step, gatekeeper?.function);
      await this.createTask(request, step, userId, now, reason, gatekeeper?.function ?? null, !isSelfApproval);
    }

    if (!isFirstStep && request.metaCreatedBy != null && fanOut.includes(request.metaCreatedBy) && step.escalateTo) {
      const escalated = await this.actorResolver.resolveEscalationRecipients(step);
      for (const userId of escalated) {
        if (fanOut.includes(userId)) continue;
        await this.createTask(request, step, userId, now, 'Escalated — the requester cannot approve their own request at this step.', null, true);
      }
    }
  }

  // Sequential ApprovalGate only ever has one Open Task at a time — the next person's Task is
  // spawned progressively, right after the previous one closes (act() calls this), rather than
  // fanning everyone out upfront like PerPerson does. Safe to call unconditionally: it's a no-op
  // for anything that isn't a sequential ApprovalGate still short of resolutionRule.
  async spawnNextSequentialTask(requestId: number, stepId: number) {
    const step = await this.prisma.db.step.findFirst({
      where: { id: stepId },
      include: { gatekeepers: { where: { metaIsDeleted: false } } },
    });
    const request = await this.prisma.db.request.findFirst({ where: { id: requestId } });
    if (!step || !request || step.type !== 'ApprovalGate' || !step.sequentialApproval) return;

    const now = new Date();
    const recipients = await this.actorResolver.resolveStepRecipients(requestId, step, request.currentStepEnteredAt ?? now);
    if (recipients.length === 0) return;

    const userId = recipients[0];
    const already = await this.prisma.db.task.findFirst({ where: { requestId, stepId, assigneeId: userId } });
    if (already) return; // defensive — resolveStepRecipients already excludes anyone who's voted this visit

    const gatekeeper = step.gatekeepers.find((g) => g.userId === userId);
    const reason = this.describeAssignmentReason(step, gatekeeper?.function);
    await this.createTask(request, step, userId, now, reason, gatekeeper?.function ?? null, true);
  }

  private describeAssignmentReason(step: { type: string; actorType: string; actorRef: string }, gatekeeperFunction?: string): string {
    if (step.type === 'ApprovalGate' && gatekeeperFunction) return `Role — Gate Keeper, ${gatekeeperFunction}`;
    if (step.actorType === 'Role') return `Role: ${step.actorRef}`;
    if (step.actorType === 'Tag') return `Tag: ${step.actorRef}`;
    if (step.actorType === 'Dynamic') return `Dynamic: ${step.actorRef}`;
    return step.actorRef?.trim() ? `Assigned: ${step.actorRef}` : 'Assigned';
  }

  private async createTask(
    request: TaskNotifyRequest,
    step: TaskNotifyStep,
    assigneeId: number,
    now: Date,
    reason: string,
    gatekeeperFunction: string | null,
    requiredForResolution = true,
  ) {
    const dueAt = step.slaValue != null && step.slaUnit ? computeDueAt(now, step.slaValue, step.slaUnit as SlaUnit) : undefined;
    const task = await this.prisma.db.task.create({
      data: { requestId: request.id, stepId: step.id, assigneeId, function: gatekeeperFunction, reason, dueAt, requiredForResolution, status: 'Open' },
    });
    await this.notifications.notifyTaskAssigned(request, task, step);
    return task;
  }
}

// Structural subsets matching NotificationsService's RequestLike/StepLike — cancelOpenTasksForStep
// and spawnTasksForStep always fetch the full Prisma row anyway, so the real objects satisfy
// these trivially; this just keeps createTask/notify* call sites honest about what they need.
interface TaskNotifyRequest {
  id: number;
  title: string;
  code: string;
  metaCreatedBy: number | null;
}
interface TaskNotifyStep {
  id: number;
  name: string;
  type: string;
  actorType: string;
  actorRef: string;
  orderIndex: number;
  sequentialApproval: boolean;
  escalateTo?: string | null;
  slaValue: number | null;
  slaUnit: string | null;
}
