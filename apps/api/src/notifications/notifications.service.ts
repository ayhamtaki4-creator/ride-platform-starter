import {
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async list(user: AuthUser, rawLimit?: string, cursor?: string) {
    const parsed = Number(rawLimit ?? 30);
    const limit = Number.isFinite(parsed)
      ? Math.min(100, Math.max(1, Math.trunc(parsed)))
      : 30;

    const notifications = await this.prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {})
    });

    const hasMore = notifications.length > limit;
    const items = hasMore
      ? notifications.slice(0, limit)
      : notifications;

    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null
    };
  }

  async unreadCount(user: AuthUser) {
    const count = await this.prisma.notification.count({
      where: {
        userId: user.sub,
        readAt: null
      }
    });

    return { count };
  }

  async markRead(user: AuthUser, id: string) {
    const notification =
      await this.prisma.notification.findFirst({
        where: {
          id,
          userId: user.sub
        }
      });

    if (!notification) {
      throw new NotFoundException('الإشعار غير موجود.');
    }

    const updated = notification.readAt
      ? notification
      : await this.prisma.notification.update({
          where: { id },
          data: { readAt: new Date() }
        });

    this.realtime.notificationRead({
      notificationId: updated.id,
      userId: user.sub,
      readAt:
        updated.readAt?.toISOString() ??
        new Date().toISOString()
    });

    return updated;
  }

  async markAllRead(user: AuthUser) {
    const readAt = new Date();

    const result = await this.prisma.notification.updateMany({
      where: {
        userId: user.sub,
        readAt: null
      },
      data: { readAt }
    });

    this.realtime.notificationsReadAll({
      userId: user.sub,
      readAt: readAt.toISOString()
    });

    return {
      updated: result.count,
      readAt: readAt.toISOString()
    };
  }

  async remove(user: AuthUser, id: string) {
    const result = await this.prisma.notification.deleteMany({
      where: {
        id,
        userId: user.sub
      }
    });

    if (result.count === 0) {
      throw new NotFoundException('الإشعار غير موجود.');
    }

    return { deleted: true };
  }
}
