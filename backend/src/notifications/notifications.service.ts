import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ActorResolverService } from '../common/actor-resolver.service';
import { NotificationsGateway } from '../notifications-gateway/notifications.gateway';

const RECENT_COUNT = 15;
const PAGE_SIZE = 20;

interface RequestLike {
  id: number;
  title: string;
  code: string;
  metaCreatedBy: number | null;
}

interface StepLike {
  id: number;
  name: string;
  type: string;
  actorType: string;
  actorRef: string;
  orderIndex: number;
  sequentialApproval: boolean;
  escalateTo?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private actorResolver: ActorResolverService,
    private gateway: NotificationsGateway,
  ) {}

  async notifyStepReached(request: RequestLike, step: StepLike) {
    const recipients = await this.actorResolver.resolveStepRecipients(request.id, step);
    for (const userId of recipients) {
      await this.add(userId, request, `"${request.title}" (${request.code}) needs your action at step "${step.name}".`);
    }
  }

  async notifyNextGatekeeper(request: RequestLike, step: StepLike, userId: number) {
    await this.add(userId, request, `It's your turn to review "${request.title}" (${request.code}) at step "${step.name}".`);
  }

  async notifyRequester(request: RequestLike, message: string) {
    if (request.metaCreatedBy != null) await this.add(request.metaCreatedBy, request, message);
  }

  async notifyEscalation(request: RequestLike, step: StepLike) {
    const recipients = await this.actorResolver.resolveEscalationRecipients(step);
    for (const userId of recipients) {
      await this.add(
        userId,
        request,
        `"${request.title}" (${request.code}) is overdue at step "${step.name}".`,
      );
    }
  }

  private async add(userId: number, request: RequestLike, message: string) {
    const notification = await this.prisma.db.notification.create({
      data: { userId, requestId: request.id, message },
    });
    this.gateway.emitToUser(userId, {
      id: notification.id,
      message: notification.message,
      requestId: request.id,
      requestCode: request.code,
      createdAt: notification.metaCreatedAt,
    });
  }

  async recent(userId: number) {
    const [unreadCount, items] = await Promise.all([
      this.prisma.db.notification.count({ where: { userId, isRead: false } }),
      this.prisma.db.notification.findMany({
        where: { userId },
        include: { request: true },
        orderBy: { metaCreatedAt: 'desc' },
        take: RECENT_COUNT,
      }),
    ]);
    return {
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        message: n.message,
        requestId: n.requestId,
        requestCode: n.request.code,
        isRead: n.isRead,
        createdAt: n.metaCreatedAt,
      })),
    };
  }

  async list(userId: number, unreadOnly: boolean, page: number) {
    const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };
    const [total, items] = await Promise.all([
      this.prisma.db.notification.count({ where }),
      this.prisma.db.notification.findMany({
        where,
        include: { request: true },
        orderBy: { metaCreatedAt: 'desc' },
        skip: (Math.max(1, page) - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return {
      page: Math.max(1, page),
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      items: items.map((n) => ({
        id: n.id,
        message: n.message,
        requestId: n.requestId,
        requestCode: n.request.code,
        isRead: n.isRead,
        createdAt: n.metaCreatedAt,
      })),
    };
  }

  async open(userId: number, notificationId: number) {
    const notification = await this.prisma.db.notification.findFirst({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException();
    if (notification.userId !== userId) throw new ForbiddenException();

    if (!notification.isRead) {
      await this.prisma.db.notification.update({
        where: { id: notificationId },
        data: { isRead: true, readAt: new Date() },
      });
    }
    return { requestId: notification.requestId };
  }

  async markAllRead(userId: number) {
    await this.prisma.db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
