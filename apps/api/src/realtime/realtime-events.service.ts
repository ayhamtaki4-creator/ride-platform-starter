import { Injectable, Logger } from '@nestjs/common';
import { Namespace, Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export type TripRealtimeEvent = {
  tripId: string;
  passengerId: string;
  driverId?: string | null;
  previousDriverId?: string | null;
  status: string;
  bookingStatus?: string;
  bookingReference?: string | null;
  occurredAt: string;
  reason?: string | null;
};


export type ServiceRunRealtimeEvent = {
  runId: string;
  runReference: string;
  driverId: string;
  previousDriverId?: string | null;
  passengerIds: string[];
  status: string;
  occurredAt: string;
  reason?: string | null;
  bookingId?: string;
  passengerStatus?: string;
};

export type DriverAvailabilityRealtimeEvent = {
  driverId: string;
  availability: string;
  occurredAt: string;
};

export type NotificationRealtimeEvent = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
  metadata?: unknown;
};

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private server?: Server | Namespace;

  attachServer(server: Server | Namespace) {
    this.server = server;
  }

  bookingCreated(event: TripRealtimeEvent) {
    this.server?.to('role:dispatch').emit('admin.booking.created', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.booking.updated', event);
    void this.notifyBookingCreated(event);
  }

  bookingUpdated(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('booking.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.booking.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.booking.updated', event);
    void this.notifyBookingUpdated(event);
  }

  tripCreated(event: TripRealtimeEvent) {
    this.server?.to('role:dispatch').emit('admin.trip.created', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    this.server?.to(`trip:${event.tripId}`).emit('trip.status.updated', event);
  }

  tripAssigned(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('trip.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.trip.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    if (event.driverId) {
      this.server?.to(`user:${event.driverId}`).emit('driver.trip.assigned', event);
    }
    void this.notifyTripAssigned(event);
  }

  tripUpdated(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('trip.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.trip.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    if (event.driverId) {
      this.server?.to(`user:${event.driverId}`).emit('driver.trip.updated', event);
    }
    void this.notifyTripStatus(event);
  }

  tripUnassigned(event: TripRealtimeEvent) {
    this.tripUpdated(event);
    if (event.previousDriverId) {
      this.server?.to(`user:${event.previousDriverId}`).emit('driver.trip.unassigned', event);
    }
    void this.notifyTripUnassigned(event);
  }

  tripReassigned(event: TripRealtimeEvent) {
    const rooms = ['role:dispatch', `user:${event.passengerId}`, `trip:${event.tripId}`];
    if (event.driverId) rooms.push(`user:${event.driverId}`);
    this.server?.to(rooms).emit('trip.status.updated', event);
    this.server?.to('role:dispatch').emit('admin.trip.updated', event);
    this.server?.to(`user:${event.passengerId}`).emit('rider.trip.updated', event);
    if (event.previousDriverId) {
      this.server?.to(`user:${event.previousDriverId}`).emit('driver.trip.unassigned', event);
    }
    if (event.driverId) {
      this.server?.to(`user:${event.driverId}`).emit('driver.trip.assigned', event);
    }
    void this.notifyTripAssigned(event, true);
  }


  runCreated(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.created', event);
    this.server?.to('role:dispatch').emit('admin.run.created', event);
  }

  runUpdated(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.updated', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
  }

  runDriverAssigned(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.driver.assigned', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
    this.server?.to(`user:${event.driverId}`).emit('driver.run.assigned', event);
    if (event.previousDriverId) {
      this.server?.to(`user:${event.previousDriverId}`).emit('driver.run.unassigned', event);
    }
    void this.notifyRunAssigned(event);
  }

  runDriverAccepted(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.driver.accepted', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
    this.server?.to(`user:${event.driverId}`).emit('driver.run.updated', event);
    void this.notifyRunAccepted(event);
  }

  runPassengerUpdated(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.passenger.updated', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
  }

  runStarted(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.started', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
    void this.notifyRunStarted(event);
  }

  runCompleted(event: ServiceRunRealtimeEvent) {
    this.emitRunEvent('run.completed', event);
    this.server?.to('role:dispatch').emit('admin.run.updated', event);
    void this.notifyRunCompleted(event);
  }

  private emitRunEvent(name: string, event: ServiceRunRealtimeEvent) {
    const rooms = [
      'role:dispatch',
      `user:${event.driverId}`,
      `run:${event.runId}`,
      ...event.passengerIds.map((id) => `user:${id}`)
    ];
    this.server?.to(rooms).emit(name, event);
    this.server?.to(`user:${event.driverId}`).emit('driver.run.updated', event);
    for (const passengerId of event.passengerIds) {
      this.server?.to(`user:${passengerId}`).emit('rider.run.updated', event);
    }
  }

  driverAvailabilityUpdated(event: DriverAvailabilityRealtimeEvent) {
    this.server?.to('role:dispatch').emit('admin.driver.availability.updated', event);
    this.server?.to(`user:${event.driverId}`).emit('driver.availability.updated', event);
  }

  notificationCreated(event: NotificationRealtimeEvent) {
    this.server
      ?.to(`user:${event.userId}`)
      .emit('notification.created', event);
  }

  notificationRead(event: {
    notificationId: string;
    userId: string;
    readAt: string;
  }) {
    this.server
      ?.to(`user:${event.userId}`)
      .emit('notification.read', event);
  }

  notificationsReadAll(event: {
    userId: string;
    readAt: string;
  }) {
    this.server
      ?.to(`user:${event.userId}`)
      .emit('notification.read-all', event);
  }

  private async notifyBookingCreated(event: TripRealtimeEvent) {
    await Promise.all([
      this.createNotification({
        userId: event.passengerId,
        type: 'BOOKING_CREATED',
        title: 'تم استلام طلب الحجز',
        message: event.bookingReference
          ? `تم استلام الحجز ${event.bookingReference} وسيقوم مركز العمليات بمراجعته.`
          : 'تم استلام طلب الحجز وسيقوم مركز العمليات بمراجعته.',
        entityType: 'Trip',
        entityId: event.tripId,
        link: `/rider/bookings/${event.tripId}`,
        dedupeKey: `booking-created:${event.tripId}:${event.passengerId}`,
        metadata: event
      }),
      this.notifyDispatch({
        type: 'ADMIN_BOOKING_CREATED',
        title: 'حجز جديد',
        message: event.bookingReference
          ? `تم إنشاء الحجز ${event.bookingReference}.`
          : 'تم إنشاء حجز جديد يحتاج إلى المتابعة.',
        entityType: 'Trip',
        entityId: event.tripId,
        link: `/admin/bookings/${event.tripId}`,
        dedupePrefix: `admin-booking-created:${event.tripId}`,
        metadata: event
      })
    ]);
  }

  private async notifyBookingUpdated(event: TripRealtimeEvent) {
    const status = event.bookingStatus;

    if (!status) return;

    const copy: Record<string, {
      title: string;
      message: string;
    }> = {
      CONFIRMED: {
        title: 'تم تأكيد الحجز',
        message: 'اعتمد مركز العمليات الحجز وسيتم استكمال التعيين والتشغيل.'
      },
      REJECTED: {
        title: 'تعذر قبول الحجز',
        message: event.reason || 'تم رفض طلب الحجز. راجع التفاصيل أو تواصل مع الدعم.'
      },
      CANCELLED: {
        title: 'تم إلغاء الحجز',
        message: event.reason || 'تم إلغاء الحجز.'
      }
    };

    const content = copy[status];

    if (!content) return;

    await this.createNotification({
      userId: event.passengerId,
      type: `BOOKING_${status}`,
      title: content.title,
      message: content.message,
      entityType: 'Trip',
      entityId: event.tripId,
      link: `/rider/bookings/${event.tripId}`,
      dedupeKey: `booking-status:${event.tripId}:${status}:${event.passengerId}`,
      metadata: event
    });
  }

  private async notifyTripAssigned(
    event: TripRealtimeEvent,
    reassigned = false
  ) {
    const jobs: Promise<void>[] = [
      this.createNotification({
        userId: event.passengerId,
        type: reassigned
          ? 'DRIVER_REASSIGNED'
          : 'DRIVER_ASSIGNED',
        title: reassigned
          ? 'تم تغيير السائق'
          : 'تم تعيين السائق',
        message: reassigned
          ? 'تم تعيين سائق بديل للحجز. افتح التفاصيل لمراجعة بيانات السائق والمركبة.'
          : 'تم تعيين سائق للحجز. افتح التفاصيل لمراجعة بيانات السائق والمركبة.',
        entityType: 'Trip',
        entityId: event.tripId,
        link: `/rider/bookings/${event.tripId}`,
        dedupeKey: `trip-assigned:${event.tripId}:${event.driverId ?? 'none'}:${event.passengerId}`,
        metadata: event
      })
    ];

    if (event.driverId) {
      jobs.push(
        this.createNotification({
          userId: event.driverId,
          type: 'TRIP_ASSIGNED_TO_DRIVER',
          title: 'مهمة جديدة',
          message: 'تم تعيين رحلة جديدة لك. راجع التفاصيل واتخذ الإجراء المطلوب.',
          entityType: 'Trip',
          entityId: event.tripId,
          link: '/driver',
          dedupeKey: `driver-trip-assigned:${event.tripId}:${event.driverId}`,
          metadata: event
        })
      );
    }

    await Promise.all(jobs);
  }

  private async notifyTripStatus(event: TripRealtimeEvent) {
    const copy: Record<string, {
      type: string;
      title: string;
      message: string;
    }> = {
      DRIVER_ARRIVING: {
        type: 'DRIVER_EN_ROUTE',
        title: 'السائق في الطريق',
        message: 'تحرك السائق باتجاه نقطة الالتقاء.'
      },
      DRIVER_ARRIVED: {
        type: 'DRIVER_ARRIVED',
        title: 'وصل السائق',
        message: 'وصل السائق إلى نقطة الالتقاء.'
      },
      IN_PROGRESS: {
        type: 'TRIP_STARTED',
        title: 'بدأت الرحلة',
        message: 'بدأ تنفيذ الرحلة بنجاح.'
      },
      COMPLETED: {
        type: 'TRIP_COMPLETED',
        title: 'اكتملت الرحلة',
        message: 'تم إنهاء الرحلة وتسجيلها كمكتملة.'
      },
      CANCELLED_BY_PASSENGER: {
        type: 'TRIP_CANCELLED',
        title: 'تم إلغاء الرحلة',
        message: event.reason || 'تم إلغاء الرحلة من قبل المسافر.'
      },
      CANCELLED_BY_DRIVER: {
        type: 'TRIP_CANCELLED',
        title: 'تم إلغاء الرحلة',
        message: event.reason || 'تم إلغاء الرحلة من قبل السائق.'
      },
      NO_DRIVER_AVAILABLE: {
        type: 'NO_DRIVER_AVAILABLE',
        title: 'لم يتوفر سائق',
        message: 'تعذر توفير سائق للرحلة في الوقت الحالي.'
      }
    };

    const content = copy[event.status];

    if (!content) return;

    await this.createNotification({
      userId: event.passengerId,
      type: content.type,
      title: content.title,
      message: content.message,
      entityType: 'Trip',
      entityId: event.tripId,
      link: `/rider/bookings/${event.tripId}`,
      dedupeKey: `trip-status:${event.tripId}:${event.status}:${event.passengerId}`,
      metadata: event
    });
  }

  private async notifyTripUnassigned(event: TripRealtimeEvent) {
    await this.notifyDispatch({
      type: 'ADMIN_DRIVER_REPLACEMENT',
      title: 'رحلة تحتاج إلى سائق بديل',
      message: event.reason || 'تم إلغاء تعيين السائق من الرحلة.',
      entityType: 'Trip',
      entityId: event.tripId,
      link: `/admin/bookings/${event.tripId}`,
      dedupePrefix: `admin-driver-replacement:${event.tripId}:${event.occurredAt}`,
      metadata: event
    });
  }

  private async notifyRunAssigned(event: ServiceRunRealtimeEvent) {
    await this.createNotification({
      userId: event.driverId,
      type: 'RUN_ASSIGNED',
      title: 'تم تعيين رحلة تشغيلية',
      message: `تم تعيين الرحلة ${event.runReference} لك. راجع قائمة الركاب والمركبة.`,
      entityType: 'ServiceRun',
      entityId: event.runId,
      link: `/driver/runs/${event.runId}`,
      dedupeKey: `run-assigned:${event.runId}:${event.driverId}`,
      metadata: event
    });
  }

  private async notifyRunAccepted(event: ServiceRunRealtimeEvent) {
    await Promise.all(
      event.passengerIds.map((passengerId) =>
        this.createNotification({
          userId: passengerId,
          type: 'RUN_DRIVER_ACCEPTED',
          title: 'قبل السائق المهمة',
          message: `قبل السائق تنفيذ الرحلة ${event.runReference}.`,
          entityType: 'ServiceRun',
          entityId: event.runId,
          link: event.bookingId
            ? `/rider/bookings/${event.bookingId}`
            : '/rider/bookings',
          dedupeKey: `run-accepted:${event.runId}:${passengerId}`,
          metadata: event
        })
      )
    );
  }

  private async notifyRunStarted(event: ServiceRunRealtimeEvent) {
    await Promise.all(
      event.passengerIds.map((passengerId) =>
        this.createNotification({
          userId: passengerId,
          type: 'RUN_STARTED',
          title: 'بدأت الرحلة التشغيلية',
          message: `بدأت الرحلة ${event.runReference}.`,
          entityType: 'ServiceRun',
          entityId: event.runId,
          link: '/rider/bookings',
          dedupeKey: `run-started:${event.runId}:${passengerId}`,
          metadata: event
        })
      )
    );
  }

  private async notifyRunCompleted(event: ServiceRunRealtimeEvent) {
    await Promise.all(
      event.passengerIds.map((passengerId) =>
        this.createNotification({
          userId: passengerId,
          type: 'RUN_COMPLETED',
          title: 'اكتملت الرحلة التشغيلية',
          message: `تم إنهاء الرحلة ${event.runReference}.`,
          entityType: 'ServiceRun',
          entityId: event.runId,
          link: '/rider/bookings',
          dedupeKey: `run-completed:${event.runId}:${passengerId}`,
          metadata: event
        })
      )
    );
  }

  private async notifyDispatch(input: {
    type: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    link?: string | null;
    dedupePrefix: string;
    metadata?: unknown;
  }) {
    const dispatchUsers = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              code: {
                in: [
                  'SUPER_ADMIN',
                  'ADMIN',
                  'OPERATIONS_MANAGER'
                ]
              }
            }
          }
        }
      },
      select: { id: true }
    });

    await Promise.all(
      dispatchUsers.map((user) =>
        this.createNotification({
          userId: user.id,
          type: input.type,
          title: input.title,
          message: input.message,
          entityType: input.entityType,
          entityId: input.entityId,
          link: input.link,
          dedupeKey: `${input.dedupePrefix}:${user.id}`,
          metadata: input.metadata
        })
      )
    );
  }

  private async createNotification(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    link?: string | null;
    dedupeKey?: string | null;
    metadata?: unknown;
  }): Promise<void> {
    try {
      const notification =
        await this.prisma.notification.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            message: input.message,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            link: input.link ?? null,
            dedupeKey: input.dedupeKey ?? null,
            metadata:
              input.metadata === undefined
                ? undefined
                : JSON.parse(JSON.stringify(input.metadata))
          }
        });

      this.notificationCreated({
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        entityType: notification.entityType,
        entityId: notification.entityId,
        link: notification.link,
        readAt:
          notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
        metadata: notification.metadata
      });
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? String((error as { code?: unknown }).code)
          : '';

      if (code !== 'P2002') {
        this.logger.warn(
          `Notification creation failed: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`
        );
      }
    }
  }
}
