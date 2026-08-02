import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  ServiceRunPassengerStatus,
  ServiceRunStatus,
  TripStatus
} from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

const runInclude = {
  route: { include: { origin: true, destination: true } },
  vehicle: {
    include: {
      baseRegion: true,
      images: {
        where: { isApproved: true },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }]
      }
    }
  },
  bookings: {
    orderBy: [{ pickupOrder: 'asc' as const }, { requestedAt: 'asc' as const }],
    include: {
      passenger: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true
        }
      }
    }
  }
} satisfies Prisma.ServiceRunInclude;

type RunWithRelations = Prisma.ServiceRunGetPayload<{ include: typeof runInclude }>;

@Injectable()
export class DriverRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async list(user: AuthUser, date?: string) {
    const where: Prisma.ServiceRunWhereInput = { driverId: user.sub };
    if (date) where.travelDate = this.dateFilter(date);

    const runs = await this.prisma.serviceRun.findMany({
      where,
      orderBy: [{ travelDate: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: runInclude
    });

    return runs.map((run) => this.serialize(run));
  }

  async detail(user: AuthUser, runId: string) {
    const run = await this.getOwnedRun(user, runId);
    return this.serialize(run);
  }

  async accept(user: AuthUser, runId: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({ where: { id: runId } });
      this.assertOwned(user, current);

      if (!['SCHEDULED', 'DRIVER_PENDING'].includes(current.status)) {
        throw new ConflictException('لا يمكن قبول الرحلة في حالتها الحالية.');
      }

      await tx.trip.updateMany({
        where: { serviceRunId: current.id, driverId: user.sub },
        data: {
          driverAssignmentStatus: 'ACCEPTED',
          driverRespondedAt: new Date(),
          acceptedAt: new Date(),
          driverRejectionReason: null
        }
      });

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: {
          status: 'DRIVER_ACCEPTED',
          driverAcceptedAt: new Date(),
          driverRejectionReason: null
        },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'service_run.driver.accept',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: { runReference: current.runReference }
        }
      });

      return updated;
    });

    this.realtime.runDriverAccepted(this.toRealtimeEvent(run));
    return this.serialize(run);
  }

  async reject(user: AuthUser, runId: string, reason: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({ where: { id: runId } });
      this.assertOwned(user, current);

      if (!['SCHEDULED', 'DRIVER_PENDING', 'DRIVER_ACCEPTED'].includes(current.status)) {
        throw new ConflictException('لا يمكن رفض الرحلة في حالتها الحالية.');
      }

      await tx.trip.updateMany({
        where: { serviceRunId: current.id, driverId: user.sub },
        data: {
          driverAssignmentStatus: 'REJECTED',
          driverRespondedAt: new Date(),
          driverRejectionReason: reason.trim(),
          acceptedAt: null
        }
      });

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: {
          status: 'DRIVER_REPLACEMENT_REQUIRED',
          driverAcceptedAt: null,
          driverRejectionReason: reason.trim()
        },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'service_run.driver.reject',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: {
            runReference: current.runReference,
            reason: reason.trim()
          }
        }
      });

      return updated;
    });

    this.realtime.runUpdated(
      this.toRealtimeEvent(run, { reason: reason.trim() })
    );
    return this.serialize(run);
  }

  async startBoarding(user: AuthUser, runId: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({
        where: { id: runId },
        include: { bookings: { select: { id: true, status: true } } }
      });
      this.assertOwned(user, current);

      if (current.status !== 'DRIVER_ACCEPTED') {
        throw new ConflictException('يجب قبول الرحلة قبل بدء صعود الركاب.');
      }

      for (const booking of current.bookings) {
        if (['DRIVER_ASSIGNED', 'DRIVER_ARRIVING'].includes(booking.status)) {
          await tx.trip.update({
            where: { id: booking.id },
            data: { status: 'DRIVER_ARRIVED' }
          });
          await tx.tripStatusHistory.create({
            data: {
              tripId: booking.id,
              from: booking.status,
              to: 'DRIVER_ARRIVED',
              actorId: user.sub,
              note: `Boarding started for run ${current.runReference}`
            }
          });
        }
      }

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: { status: 'BOARDING', boardingStartedAt: new Date() },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'service_run.boarding.start',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: { runReference: current.runReference }
        }
      });

      return updated;
    });

    this.realtime.runUpdated(this.toRealtimeEvent(run));
    return this.serialize(run);
  }

  async updatePassengerStatus(
    user: AuthUser,
    runId: string,
    bookingId: string,
    to: ServiceRunPassengerStatus
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const run = await tx.serviceRun.findUnique({ where: { id: runId } });
      this.assertOwned(user, run);

      if (!['BOARDING', 'IN_PROGRESS'].includes(run.status)) {
        throw new ConflictException('لا يمكن تحديث حضور الركاب الآن.');
      }

      const booking = await tx.trip.findUnique({ where: { id: bookingId } });
      if (!booking || booking.serviceRunId !== run.id) {
        throw new NotFoundException('الحجز غير موجود ضمن الرحلة.');
      }

      this.assertPassengerTransition(
        booking.serviceRunPassengerStatus,
        to,
        run.status
      );

      const previousTripStatus = booking.status;
      let nextTripStatus: TripStatus = booking.status;
      const data: Prisma.TripUpdateInput = {
        serviceRunPassengerStatus: to
      };

      if (to === 'PICKED_UP') {
        data.pickedUpAt = new Date();
      } else if (to === 'NO_SHOW') {
        data.noShowAt = new Date();
        data.cancelledAt = new Date();
        data.status = 'PASSENGER_NO_SHOW';
        nextTripStatus = 'PASSENGER_NO_SHOW';
      } else if (to === 'DROPPED_OFF') {
        data.droppedOffAt = new Date();
        data.completedAt = new Date();
        data.status = 'COMPLETED';
        data.finalFare = booking.finalFare ?? booking.estimatedFare;
        nextTripStatus = 'COMPLETED';
      }

      const updatedBooking = await tx.trip.update({
        where: { id: booking.id },
        data
      });

      if (previousTripStatus !== nextTripStatus) {
        await tx.tripStatusHistory.create({
          data: {
            tripId: booking.id,
            from: previousTripStatus,
            to: nextTripStatus,
            actorId: user.sub,
            note: `Passenger manifest status: ${to}`
          }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'service_run.passenger.status',
          entityType: 'Trip',
          entityId: booking.id,
          metadata: {
            runId: run.id,
            runReference: run.runReference,
            from: booking.serviceRunPassengerStatus,
            to
          }
        }
      });

      const updatedRun = await tx.serviceRun.findUniqueOrThrow({
        where: { id: run.id },
        include: runInclude
      });

      return { run: updatedRun, booking: updatedBooking };
    });

    this.realtime.runPassengerUpdated(
      this.toRealtimeEvent(result.run, {
        bookingId: result.booking.id,
        passengerStatus: result.booking.serviceRunPassengerStatus
      })
    );
    this.realtime.tripUpdated(this.toTripEvent(result.booking));
    return this.serialize(result.run);
  }

  async start(user: AuthUser, runId: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({
        where: { id: runId },
        include: {
          bookings: {
            select: {
              id: true,
              status: true,
              serviceRunPassengerStatus: true
            }
          }
        }
      });
      this.assertOwned(user, current);

      if (current.status !== 'BOARDING') {
        throw new ConflictException('يجب بدء صعود الركاب أولًا.');
      }

      const waiting = current.bookings.filter(
        (item) => item.serviceRunPassengerStatus === 'WAITING'
      );
      const pickedUp = current.bookings.filter(
        (item) => item.serviceRunPassengerStatus === 'PICKED_UP'
      );

      if (waiting.length > 0) {
        throw new ConflictException('حدد حالة كل حجز قبل بدء الرحلة.');
      }
      if (pickedUp.length === 0) {
        throw new ConflictException('لا يوجد أي راكب صعد إلى المركبة.');
      }

      for (const booking of pickedUp) {
        if (booking.status !== 'IN_PROGRESS') {
          await tx.trip.update({
            where: { id: booking.id },
            data: { status: 'IN_PROGRESS', startedAt: new Date() }
          });
          await tx.tripStatusHistory.create({
            data: {
              tripId: booking.id,
              from: booking.status,
              to: 'IN_PROGRESS',
              actorId: user.sub,
              note: `Service run ${current.runReference} started`
            }
          });
        }
      }

      await tx.driverProfile.updateMany({
        where: { userId: user.sub, status: 'APPROVED' },
        data: { availability: 'ON_TRIP' }
      });

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'service_run.start',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: {
            runReference: current.runReference,
            passengerGroups: pickedUp.length
          }
        }
      });

      return updated;
    });

    this.realtime.runStarted(this.toRealtimeEvent(run));
    return this.serialize(run);
  }

  async complete(user: AuthUser, runId: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({
        where: { id: runId },
        include: {
          bookings: {
            select: {
              id: true,
              status: true,
              estimatedFare: true,
              serviceRunPassengerStatus: true
            }
          }
        }
      });
      this.assertOwned(user, current);

      if (current.status !== 'IN_PROGRESS') {
        throw new ConflictException('الرحلة ليست قيد التنفيذ.');
      }

      for (const booking of current.bookings) {
        if (booking.serviceRunPassengerStatus === 'NO_SHOW') continue;
        if (booking.status !== 'COMPLETED') {
          await tx.trip.update({
            where: { id: booking.id },
            data: {
              status: 'COMPLETED',
              serviceRunPassengerStatus: 'DROPPED_OFF',
              droppedOffAt: new Date(),
              completedAt: new Date(),
              finalFare: booking.estimatedFare
            }
          });
          await tx.tripStatusHistory.create({
            data: {
              tripId: booking.id,
              from: booking.status,
              to: 'COMPLETED',
              actorId: user.sub,
              note: `Service run ${current.runReference} completed`
            }
          });
        }
      }

      await tx.driverProfile.updateMany({
        where: { userId: user.sub, status: 'APPROVED' },
        data: { availability: 'ONLINE' }
      });

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'service_run.complete',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: { runReference: current.runReference }
        }
      });

      return updated;
    });

    this.realtime.runCompleted(this.toRealtimeEvent(run));
    this.realtime.driverAvailabilityUpdated({
      driverId: user.sub,
      availability: 'ONLINE',
      occurredAt: new Date().toISOString()
    });
    return this.serialize(run);
  }

  private async getOwnedRun(user: AuthUser, runId: string) {
    const run = await this.prisma.serviceRun.findUnique({
      where: { id: runId },
      include: runInclude
    });
    this.assertOwned(user, run);
    return run;
  }

  private assertOwned<T extends { driverId: string } | null>(
    user: AuthUser,
    run: T
  ): asserts run is NonNullable<T> {
    if (!run) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
    if (run.driverId !== user.sub) {
      throw new ForbiddenException('هذه الرحلة غير معيّنة لك.');
    }
  }

  private assertPassengerTransition(
    from: ServiceRunPassengerStatus,
    to: ServiceRunPassengerStatus,
    runStatus: ServiceRunStatus
  ) {
    const valid =
      (from === 'WAITING' && ['PICKED_UP', 'NO_SHOW'].includes(to)) ||
      (from === 'PICKED_UP' && to === 'DROPPED_OFF' && runStatus === 'IN_PROGRESS');

    if (!valid) {
      throw new ConflictException(`انتقال حالة الراكب غير مسموح: ${from} → ${to}`);
    }
  }

  private serialize(run: RunWithRelations) {
    const bookings = run.bookings.map((booking) => {
      const { startPinHash: _hidden, ...safe } = booking;
      return safe;
    });

    return {
      ...run,
      bookings,
      report: {
        bookingCount: bookings.length,
        passengerCount: bookings.reduce(
          (sum, booking) => sum + booking.passengerCount,
          0
        ),
        luggageCount: bookings.reduce(
          (sum, booking) => sum + booking.luggageCount,
          0
        ),
        grossRevenue: bookings.reduce(
          (sum, booking) => sum + Number(booking.finalFare ?? booking.estimatedFare),
          0
        ),
        driverFees: bookings.reduce(
          (sum, booking) => sum + Number(booking.driverFee),
          0
        ),
        platformMargin: bookings.reduce(
          (sum, booking) => sum + Number(booking.platformMargin),
          0
        ),
        occupancyPercent:
          run.seatCapacity > 0
            ? Math.round((run.reservedSeats / run.seatCapacity) * 100)
            : 0
      }
    };
  }

  private toRealtimeEvent(
    run: RunWithRelations,
    extra?: {
      reason?: string | null;
      bookingId?: string;
      passengerStatus?: string;
    }
  ) {
    return {
      runId: run.id,
      runReference: run.runReference,
      driverId: run.driverId,
      passengerIds: Array.from(new Set(run.bookings.map((item) => item.passengerId))),
      status: run.status,
      occurredAt: new Date().toISOString(),
      ...extra
    };
  }

  private toTripEvent(trip: {
    id: string;
    passengerId: string;
    driverId: string | null;
    status: TripStatus;
    bookingReviewStatus: string;
    bookingReference: string | null;
  }) {
    return {
      tripId: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
      bookingStatus: trip.bookingReviewStatus,
      bookingReference: trip.bookingReference,
      occurredAt: new Date().toISOString()
    };
  }

  private dateFilter(value: string): Prisma.DateTimeFilter {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException('صيغة التاريخ غير صحيحة.');
    }
    const start = new Date(parsed);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }
}
