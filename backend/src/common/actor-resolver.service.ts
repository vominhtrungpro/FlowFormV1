import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CurrentUserPayload } from './current-user.decorator';

interface StepLike {
  id: number;
  orderIndex: number;
  type: string;
  actorType: string;
  actorRef: string;
  sequentialApproval: boolean;
  escalateTo?: string | null;
}

interface RequestLike {
  id: number;
  metaCreatedBy: number | null;
}

function splitRefValues(actorRef: string | null | undefined): string[] {
  return (actorRef ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// Shared between requests.service.ts (can-view / can-act permission checks — ports
// RequestController.ActorMatchesCurrentUser) and notifications.service.ts (recipient resolution
// — ports NotificationService.ResolveStepRecipients/ResolveEscalationRecipients). Both sides of
// the old C# app duplicated this matching logic separately; here it's one implementation.
@Injectable()
export class ActorResolverService {
  constructor(private prisma: PrismaService) {}

  // "Is this specific logged-in user the one this step's who-acts rule points at right now?"
  async matchesCurrentUser(step: StepLike, currentUser: CurrentUserPayload, request?: RequestLike): Promise<boolean> {
    if (currentUser.role === 'admin') return true;

    if (request && step.orderIndex === 0) {
      return request.metaCreatedBy === currentUser.userId;
    }

    if (step.type === 'ApprovalGate') {
      const gatekeepers = await this.prisma.db.stepGatekeeper.findMany({ where: { stepId: step.id } });
      return gatekeepers.some((g) => g.userId === currentUser.userId);
    }

    const refValues = splitRefValues(step.actorRef);
    if (refValues.length === 0) return false;

    const email = currentUser.email.toLowerCase();
    switch (step.actorType) {
      case 'User':
        return refValues.some((v) => v.toLowerCase() === email);
      case 'Role':
        return refValues.some((v) => v.toLowerCase() === currentUser.role.toLowerCase());
      case 'Tag':
        return refValues.some((v) => v.toLowerCase() === currentUser.tag.toLowerCase());
      case 'Dynamic': {
        const localPart = email.split('@')[0];
        return refValues.some((v) => v.toLowerCase() === email || v.toLowerCase() === localPart);
      }
      default:
        return false;
    }
  }

  // "Everyone whose who-acts points at this step right now" — resolved against the whole Users
  // table instead of a single logged-in user. For a sequential ApprovalGate, only the next unvoted
  // gatekeeper (in insertion/id order) is returned; for parallel, all active gatekeepers are.
  // `sinceEnteredAt` scopes "voted" to Tasks from *this* visit to the step — a signature from a
  // prior Return-then-resubmit cycle must not count (task-mo-ta-cho-dev.html rule 3).
  async resolveStepRecipients(requestId: number, step: StepLike, sinceEnteredAt: Date): Promise<number[]> {
    if (step.type === 'ApprovalGate') {
      const active = await this.prisma.db.stepGatekeeper.findMany({
        where: { stepId: step.id },
        orderBy: { id: 'asc' },
      });
      if (active.length === 0) return [];

      if (step.sequentialApproval) {
        const voted = new Set(
          (
            await this.prisma.db.task.findMany({
              where: { requestId, stepId: step.id, status: 'Approved', metaCreatedAt: { gte: sinceEnteredAt } },
            })
          ).map((t) => t.assigneeId),
        );
        const nextUp = active.find((g) => !voted.has(g.userId));
        return nextUp ? [nextUp.userId] : [];
      }

      return [...new Set(active.map((g) => g.userId))];
    }

    const refValues = splitRefValues(step.actorRef);
    if (refValues.length === 0) return [];

    const users = await this.prisma.db.user.findMany();
    const lowerRefs = refValues.map((v) => v.toLowerCase());

    switch (step.actorType) {
      case 'User':
        return users.filter((u) => lowerRefs.includes(u.email.toLowerCase())).map((u) => u.id);
      case 'Role':
        return users.filter((u) => lowerRefs.includes(u.role.toLowerCase())).map((u) => u.id);
      case 'Tag':
        return users.filter((u) => lowerRefs.includes(u.tag.toLowerCase())).map((u) => u.id);
      case 'Dynamic':
        return users
          .filter((u) => {
            const email = u.email.toLowerCase();
            const localPart = email.split('@')[0];
            return lowerRefs.includes(email) || lowerRefs.includes(localPart);
          })
          .map((u) => u.id);
      default:
        return [];
    }
  }

  // EscalateTo is a plain comma-separated list of user emails (not a Role/Tag lookup).
  async resolveEscalationRecipients(step: StepLike): Promise<number[]> {
    const emails = splitRefValues(step.escalateTo).map((e) => e.toLowerCase());
    if (emails.length === 0) return [];
    const users = await this.prisma.db.user.findMany();
    return users.filter((u) => emails.includes(u.email.toLowerCase())).map((u) => u.id);
  }
}
