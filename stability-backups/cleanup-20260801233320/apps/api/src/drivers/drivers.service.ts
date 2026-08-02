import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  DriverAvailability,
  Prisma,
  TripStatus
} from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

const LIVE_TRIP_STATUSES: TripStatus[] = [
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS'
];

const scheduleInclude = {
  passenger: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true
    }
  },
  serviceRun: {
    include: {
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          color: true,
          plateNumber: true,
          seatCapacity: true
        }
      },
      bookings: {
        orderBy: { requestedAt: 'asc' as const },
        select: {
          id: true,
          bookingReference: true,
          passengerCount: true,
          luggageCount: true,
          contactName: true,
          contactPhone: true,
          pickupAddress: true,
          dropoffAddress: true,
          driverAssignmentStatus: true
        }
      }
    }
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const }
  }
} satisfies Prisma.TripInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async mine(user: AuthUser) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub },
      include: {
        vehicles: {
          where: { isActive: true },
          orderBy: { year: 'desc' }
        }
      }
    });

    if (!profile) {
      throw new NotFoundException('ملف السائق غير موجود.');
    }

    return profile;
  }

  async schedule(user: AuthUser, date?: string) {
    const where: Prisma.TripWhereInput = {
      driverId: user.sub,
      bookingReference: { not: null }
    };

    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        throw new ConflictException('صيغة التاريخ غير صحيحة.');
      }
      const start = new Date(parsed);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.travelDate = { gte: start, lt: end };
    }

    const trips = await this.prisma.trip.findMany({
      where,
      orderBy: [
        { travelDate: 'asc' },
        { flightArrivalTime: 'asc' },
        { requestedAt: 'asc' }
      ],
      take: 150,
      include: scheduleInclude
    });

    return trips.map((trip) => this.sanitizeTrip(trip));
  }

  async acceptAssignment(user: AuthUser, tripId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (trip.driverId !== user.sub) {
        throw new ForbiddenException('الحجز غير معيّن لهذا السائق.');
      }
      if (
        trip.status !== 'DRIVER_ASSIGNED' ||
        trip.driverAssignmentStatus !== 'PENDING'
      ) {
        throw new ConflictException('لا يمكن قبول هذه المهمة في حالتها الحالية.');
      }

      const result = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: user.sub,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING'
        },
        data: {
          driverAssignmentStatus: 'ACCEPTED',
          driverRespondedAt: new Date(),
          acceptedAt: new Date(),
          driverRejectionReason: null
        }
      });

      if (result.count !== 1) {
        throw new ConflictException('تغيرت المهمة. أعد تحميل الجدول.');
      }

      if (trip.serviceRunId) {
        const pendingCount = await tx.trip.count({
          where: {
            serviceRunId: trip.serviceRunId,
            driverAssignmentStatus: 'PENDING'
          }
        });

        await tx.serviceRun.update({
          where: { id: trip.serviceRunId },
          data: {
            status: pendingCount === 0 ? 'DRIVER_ACCEPTED' : 'DRIVER_PENDING'
          }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'driver.assignment.accept',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            serviceRunId: trip.serviceRunId,
            bookingReference: trip.bookingReference
          }
        }
      });

      return tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        include: scheduleInclude
      });
    });

    this.realtime.tripUpdated(this.toRealtimeEvent(updated));
    return this.sanitizeTrip(updated);
  }

  async rejectAssignment(
    user: AuthUser,
    tripId: string,
    reason: string
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (trip.driverId !== user.sub) {
        throw new ForbiddenException('الحجز غير معيّن لهذا السائق.');
      }
      if (
        trip.status !== 'DRIVER_ASSIGNED' ||
        trip.driverAssignmentStatus !== 'PENDING'
      ) {
        throw new ConflictException('لا يمكن رفض هذه المهمة في حالتها الحالية.');
      }

      const previousDriverId = trip.driverId;
      const previousRunId = trip.serviceRunId;

      if (previousRunId) {
        const run = await tx.serviceRun.findUnique({
          where: { id: previousRunId }
        });

        if (run) {
          const remaining = Math.max(
            0,
            run.reservedSeats - trip.passengerCount
          );

          await tx.serviceRun.update({
            where: { id: run.id },
            data: {
              reservedSeats: remaining,
              status: remaining === 0 ? 'CANCELLED' : 'PLANNED'
            }
          });
        }
      }

      const updatedCount = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: user.sub,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING'
        },
        data: {
          driverId: null,
          serviceRunId: null,
          status: 'PENDING_DISPATCH',
          driverAssignmentStatus: 'REJECTED',
          driverRespondedAt: new Date(),
          driverRejectionReason: reason.trim(),
          acceptedAt: null
        }
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException('تغيرت المهمة. أعد تحميل الجدول.');
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId,
          from: 'DRIVER_ASSIGNED',
          to: 'PENDING_DISPATCH',
          actorId: user.sub,
          note: `Driver rejected assignment: ${reason.trim()}`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'driver.assignment.reject',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            previousDriverId,
            previousRunId,
            reason: reason.trim()
          }
        }
      });

      const updated = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        include: scheduleInclude
      });

      return { updated, previousDriverId };
    });

    this.realtime.tripUnassigned(
      this.toRealtimeEvent(result.updated, {
        previousDriverId: result.previousDriverId,
        reason: reason.trim()
      })
    );

    return this.sanitizeTrip(result.updated);
  }

  async setAvailability(
    user: AuthUser,
    requestedAvailability: DriverAvailability
  ) {
    if (requestedAvailability === DriverAvailability.ON_TRIP) {
      throw new ForbiddenException('لا يمكن اختيار حالة ON_TRIP يدويًا.');
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub }
    });

    if (!profile) {
      throw new NotFoundException('ملف السائق غير موجود.');
    }

    if (profile.status !== 'APPROVED') {
      throw new ForbiddenException('يجب اعتماد حساب السائق أولًا.');
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId: user.sub,
        status: { in: LIVE_TRIP_STATUSES }
      },
      select: { id: true }
    });

    if (activeTrip) {
      throw new ConflictException(
        'لا يمكن تغيير حالة الاتصال أثناء وجود رحلة جارية.'
      );
    }

    const updated = await this.prisma.driverProfile.update({
      where: { userId: user.sub },
      data: { availability: requestedAvailability }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'driver.availability.update',
        entityType: 'DriverProfile',
        entityId: updated.id,
        metadata: {
          from: profile.availability,
          to: requestedAvailability
        }
      }
    });

    this.realtime.driverAvailabilityUpdated({
      driverId: user.sub,
      availability: requestedAvailability,
      occurredAt: new Date().toISOString()
    });

    return updated;
  }

  private sanitizeTrip<T extends { startPinHash: string }>(
    trip: T
  ): Omit<T, 'startPinHash'> {
    const { startPinHash: _hidden, ...safeTrip } = trip;
    return safeTrip;
  }

  private toRealtimeEvent(
    trip: {
      id: string;
      passengerId: string;
      driverId: string | null;
      status: string;
      bookingReviewStatus: string;
      bookingReference: string | null;
    },
    extra?: { previousDriverId?: string | null; reason?: string | null }
  ) {
    return {
      tripId: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
      bookingStatus: trip.bookingReviewStatus,
      bookingReference: trip.bookingReference,
      occurredAt: new Date().toISOString(),
      ...extra
    };
  }
}
