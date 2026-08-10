import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConditionEvaluatorService } from '../condition-evaluator/condition-evaluator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransitionAction } from '../common/enums';

// Ports FlowFormDemo/Services/WorkflowEngine.cs — the single chokepoint every Submit/Approve/
// Return/Reject/Complete transition flows through, including the auto-route-through-Condition-
// steps loop and the post-transition notification hook.
@Injectable()
export class WorkflowEngineService {
  constructor(
    private prisma: PrismaService,
    private conditionEvaluator: ConditionEvaluatorService,
    private notifications: NotificationsService,
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
        slaEscalatedAt: null,
        status,
        completedAt,
      },
    });

    const finalStepId = await this.autoRouteThroughConditionSteps(request.id, toStepId);
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

      const fieldValues = await this.prisma.db.requestFieldValue.findMany({ where: { requestId } });
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
          slaEscalatedAt: null,
          status: resolvedToStepId == null ? 'Completed' : 'InProgress',
          completedAt: resolvedToStepId == null ? now : undefined,
        },
      });

      stepId = resolvedToStepId;
    }
    return stepId;
  }

  private async notifyForLanding(requestId: number, action: TransitionAction, finalStepId: number | null) {
    const request = await this.prisma.db.request.findFirst({ where: { id: requestId } });
    if (!request) return;

    if (finalStepId == null) {
      const message =
        action === 'Reject'
          ? `Your request "${request.title}" (${request.code}) was rejected.`
          : `Your request "${request.title}" (${request.code}) is complete.`;
      await this.notifications.notifyRequester(request, message);
      return;
    }

    const step = await this.prisma.db.step.findFirst({ where: { id: finalStepId } });
    if (step) await this.notifications.notifyStepReached(request, step);
  }
}
