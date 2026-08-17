import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// Ports FlowFormDemo/Services/SlaEscalationJob.cs, but scoped to individual Tasks now instead of
// (request, current step) — a step with several Open tasks (Gate Review's fan-out) used to
// escalate once for the whole request regardless of which gatekeeper was actually late; now each
// overdue Task escalates independently, guarded by its own escalatedAt so it only fires once.
@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  @Interval(60_000)
  async runOnce() {
    try {
      await this.checkBreaches();
    } catch (err) {
      this.logger.error('SLA escalation tick failed.', err as Error);
    }
  }

  private async checkBreaches() {
    const now = new Date();
    const overdueTasks = await this.prisma.db.task.findMany({
      where: { status: 'Open', escalatedAt: null, dueAt: { not: null, lt: now } },
      include: { step: true, request: true },
    });

    for (const task of overdueTasks) {
      if (!task.step.escalateTo) continue;

      await this.notifications.notifyEscalation(task.request, task, task.step);
      await this.prisma.db.task.update({ where: { id: task.id }, data: { escalatedAt: now } });
    }
  }
}
