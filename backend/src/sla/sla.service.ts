import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isSlaBreached } from './sla-calculator';
import { SlaUnit } from '../common/enums';

// Ports FlowFormDemo/Services/SlaEscalationJob.cs — @Interval replaces PeriodicTimer, otherwise
// the same shape: scan requests sitting on a step past its configured SLA, escalate once per
// step-visit (guarded by `slaEscalatedAt`, cleared whenever the request moves to a new step).
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
    const candidates = await this.prisma.db.request.findMany({
      where: { currentStepId: { not: null }, slaEscalatedAt: null },
      include: { currentStep: true },
    });

    const now = new Date();
    for (const request of candidates) {
      const step = request.currentStep;
      if (!step || step.slaValue == null || !step.slaUnit || !step.escalateTo) continue;

      const enteredAt = request.currentStepEnteredAt ?? request.metaCreatedAt;
      if (!isSlaBreached(enteredAt, step.slaValue, step.slaUnit as SlaUnit, now)) continue;

      await this.notifications.notifyEscalation(request, step);
      await this.prisma.db.request.update({ where: { id: request.id }, data: { slaEscalatedAt: now } });
    }
  }
}
