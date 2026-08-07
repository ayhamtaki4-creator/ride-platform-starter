import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  BookingType,
  Prisma,
  ServiceRunStatus,
  Trip,
  TripStatus
} from '@prisma/client';
import { randomInt } from 'crypto';
import { ComplianceService } from '../compliance/compliance.service';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { minimumVehicleCapacity } from '../pricing/vehicle-class';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { TripStateMachine } from '../trips/trip-state-machine';

const PENDING_DISPATCH_STATUSES: TripStatus[] = [
  'PENDING_DISPATCH',
  'SEARCHING_DRIVER'
];

const REASSIGNABLE_TRIP_STATUSES: TripStatus[] = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED'
];

const ACTIVE_RUN_STATUSES: ServiceRunStatus[] = [
  'DRAFT',
  'PLANNED',
  'SCHEDULED',
  'DRIVER_PENDING',
  'DRIVER_ACCEPTED',
  'BOARDING',
  'IN_PROGRESS',
  'DRIVER_REPLACEMENT_REQUIRED'
];

const tripViewInclude = {
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  route: {
    include: {
      origin: true,
      destination: true,
      requiredRegions: { include: { region: true } }
    }
  },
  passenger: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true
    }
  },
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      driverProfile: {
        select: {
          rating: true,
          avatarUrl: true,
          baseRegion: true,
          vehicles: {
            where: { isActive: true },
            orderBy: { year: 'desc' as const },
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              color: true,
              plateNumber: true,
              seatCapacity: true,
              primaryImageUrl: true,
              baseRegion: true,
              images: {
                where: { isApproved: true },
                orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }]
              }
            }
          }
        }
      }
    }
  },
  serviceRun: {
    include: {
      route: { include: { origin: true, destination: true } },
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          color: true,
          plateNumber: true,
          seatCapacity: true,
          primaryImageUrl: true,
          baseRegion: true,
          images: {
            where: { isApproved: true },
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }]
          }
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
          driverAssignmentStatus: true
        }
      }
    }
  }
} satisfies Prisma.TripInclude;

type ActiveVehicle = {
  id: string;
  seatCapacity: number;
};

type RegionAccess = {
  regionId: string;
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
    private readonly compliance: ComplianceService
  ) {}

  auditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  async pendingTrips() {
    const trips = await this.prisma.trip.findMany({
      where: {
        status: { in: PENDING_DISPATCH_STATUSES },
        bookingReviewStatus: 'CONFIRMED',
        driverId: null
      },
      orderBy: [{ travelDate: 'asc' }, { requestedAt: 'asc' }],
      take: 100,
      include: tripViewInclude
    });

    return trips.map((trip) => this.sanitizeTrip(trip));
  }

  async availableDrivers() {
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        status: 'APPROVED',
        availability: { in: ['ONLINE', 'ON_TRIP'] },
        user: { status: 'ACTIVE' },
        vehicles: { some: { isActive: true } }
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }],
      take: 100,
      include: {
        baseRegion: true,
        regionAccesses: { include: { region: true } },
        vehicles: {
          where: { isActive: true },
          orderBy: { year: 'desc' },
          include: {
            baseRegion: true,
            regionAccesses: { include: { region: true } },
            images: {
              where: { isApproved: true },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }]
            }
          }
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            driverTrips: {
              where: { status: 'COMPLETED' },
              select: { id: true }
            },
            driverServiceRuns: {
              where: {
                travelDate: { gte: new Date() },
                status: { in: ACTIVE_RUN_STATUSES }
              },
              select: {
                id: true,
                travelDate: true,
                direction: true,
                routeId: true,
                route: { select: { id: true, code: true, nameAr: true } },
                bookingType: true,
                reservedSeats: true,
                seatCapacity: true,
                status: true
              },
              orderBy: { travelDate: 'asc' },
              take: 10
            }
          }
        }
      }
    });

    return profiles.map((profile) => ({
      id: profile.id,
      userId: profile.userId,
      status: profile.status,
      availability: profile.availability,
      rating: profile.rating,
      avatarUrl: profile.avatarUrl,
      baseRegion: profile.baseRegion,
      regionAccesses: profile.regionAccesses,
      vehicles: profile.vehicles.map((vehicle) => ({
        ...vehicle,
        publicImageUrl:
          vehicle.primaryImageUrl ??
          vehicle.images.find((image) => image.isPrimary)?.url ??
          vehicle.images[0]?.url ??
          null
      })),
      vehicle: profile.vehicles[0] ?? null,
      user: {
        id: profile.user.id,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        email: profile.user.email,
        phone: profile.user.phone
      },
      completedTrips: profile.user.driverTrips.length,
      upcomingRuns: profile.user.driverServiceRuns
    }));
  }

  async assignDriver(
    actor: AuthUser,
    tripId: string,
    driverId: string,
    vehicleId?: string
  ) {
    const assigned = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (trip.bookingReviewStatus !== 'CONFIRMED') {
        throw new ConflictException('يجب تأكيد الحجز قبل تعيين السائق.');
      }
      if (trip.driverId || !PENDING_DISPATCH_STATUSES.includes(trip.status)) {
        throw new ConflictException('الحجز لم يعد بانتظار تعيين سائق.');
      }

      TripStateMachine.assertTransition(trip.status, 'DRIVER_ASSIGNED');
      const vehicle = await this.assertDriverAvailable(
        tx,
        driverId,
        vehicleId,
        trip
      );
      const serviceRun = await this.attachToServiceRun(tx, trip, driverId, vehicle);

      const tripLock = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: null,
          status: { in: PENDING_DISPATCH_STATUSES }
        },
        data: {
          driverId,
          serviceRunId: serviceRun?.id ?? null,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING',
          assignedAt: new Date(),
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null
        }
      });

      if (tripLock.count !== 1) {
        throw new ConflictException('تم تعيين هذا الحجز من مشرف آخر.');
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId,
          from: trip.status,
          to: 'DRIVER_ASSIGNED',
          actorId: actor.sub,
          note: `Assignment to driver ${driverId}; vehicle ${vehicle.id}${
            serviceRun ? `; run ${serviceRun.runReference}` : ''
          }`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'booking.dispatch.assign_driver',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            driverId,
            vehicleId: vehicle.id,
            routeId: trip.routeId,
            serviceRunId: serviceRun?.id ?? null,
            runReference: serviceRun?.runReference ?? null,
            passengerCount: trip.passengerCount,
            from: trip.status,
            to: 'DRIVER_ASSIGNED'
          }
        }
      });

      return tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        include: tripViewInclude
      });
    });

    this.realtime.tripAssigned(this.toRealtimeEvent(assigned));
    return this.sanitizeTrip(assigned);
  }

  async unassignDriver(actor: AuthUser, tripId: string, note?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (!trip.driverId || !REASSIGNABLE_TRIP_STATUSES.includes(trip.status)) {
        throw new ConflictException('لا يمكن إلغاء تعيين السائق في حالة الحجز الحالية.');
      }

      TripStateMachine.assertTransition(trip.status, 'PENDING_DISPATCH');
      const previousDriverId = trip.driverId;
      await this.detachFromServiceRun(tx, trip);

      const tripLock = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: previousDriverId,
          status: trip.status
        },
        data: {
          driverId: null,
          serviceRunId: null,
          status: 'PENDING_DISPATCH',
          driverAssignmentStatus: 'UNASSIGNED',
          assignedAt: null,
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null
        }
      });

      if (tripLock.count !== 1) {
        throw new ConflictException('تغير الحجز. أعد تحميل الصفحة.');
      }

      if (trip.status !== 'DRIVER_ASSIGNED') {
        await tx.driverProfile.updateMany({
          where: { userId: previousDriverId, status: 'APPROVED' },
          data: { availability: 'ONLINE' }
        });
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId,
          from: trip.status,
          to: 'PENDING_DISPATCH',
          actorId: actor.sub,
          note: note?.trim() || 'Driver unassigned by operations'
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'booking.dispatch.unassign_driver',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            previousDriverId,
            serviceRunId: trip.serviceRunId,
            from: trip.status,
            to: 'PENDING_DISPATCH',
            note: note?.trim() || null
          }
        }
      });

      const updated = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        include: tripViewInclude
      });

      return { updated, previousDriverId };
    });

    this.realtime.tripUnassigned(
      this.toRealtimeEvent(result.updated, {
        previousDriverId: result.previousDriverId,
        reason: note?.trim() || null
      })
    );

    return this.sanitizeTrip(result.updated);
  }

  async reassignDriver(
    actor: AuthUser,
    tripId: string,
    driverId: string,
    vehicleId?: string,
    note?: string
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (!trip.driverId || !REASSIGNABLE_TRIP_STATUSES.includes(trip.status)) {
        throw new ConflictException('لا يمكن نقل الحجز في حالته الحالية.');
      }
      if (trip.driverId === driverId && !vehicleId) {
        throw new ConflictException('السائق الجديد هو السائق الحالي.');
      }

      const previousDriverId = trip.driverId;
      const vehicle = await this.assertDriverAvailable(
        tx,
        driverId,
        vehicleId,
        trip
      );
      await this.detachFromServiceRun(tx, trip);
      const serviceRun = await this.attachToServiceRun(tx, trip, driverId, vehicle);

      const updatedCount = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: previousDriverId,
          status: trip.status
        },
        data: {
          driverId,
          serviceRunId: serviceRun?.id ?? null,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING',
          assignedAt: new Date(),
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null
        }
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException('تغير الحجز. أعد تحميل الصفحة.');
      }

      if (trip.status !== 'DRIVER_ASSIGNED' && previousDriverId !== driverId) {
        await tx.driverProfile.updateMany({
          where: { userId: previousDriverId, status: 'APPROVED' },
          data: { availability: 'ONLINE' }
        });
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId,
          from: trip.status,
          to: 'DRIVER_ASSIGNED',
          actorId: actor.sub,
          note:
            note?.trim() ||
            `Driver reassigned from ${previousDriverId} to ${driverId}; vehicle ${vehicle.id}`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'booking.dispatch.reassign_driver',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            previousDriverId,
            driverId,
            vehicleId: vehicle.id,
            routeId: trip.routeId,
            serviceRunId: serviceRun?.id ?? null,
            runReference: serviceRun?.runReference ?? null,
            note: note?.trim() || null
          }
        }
      });

      const updated = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        include: tripViewInclude
      });

      return { updated, previousDriverId };
    });

    this.realtime.tripReassigned(
      this.toRealtimeEvent(result.updated, {
        previousDriverId: result.previousDriverId,
        reason: note?.trim() || null
      })
    );

    return this.sanitizeTrip(result.updated);
  }

  private async assertDriverAvailable(
    tx: Prisma.TransactionClient,
    driverId: string,
    requestedVehicleId: string | undefined,
    trip: Pick<Trip, 'routeId' | 'travelDate' | 'passengerCount' | 'vehicleClass'>
  ): Promise<ActiveVehicle> {
    const classConfig = await tx.vehicleClassConfig.findUnique({
      where: { vehicleClass: trip.vehicleClass }
    });
    const minimumCapacity = minimumVehicleCapacity(
      trip.vehicleClass,
      trip.passengerCount,
      classConfig?.passengerCapacity
    );
    const driver = await tx.driverProfile.findUnique({
      where: { userId: driverId },
      include: {
        user: { select: { status: true } },
        regionAccesses: true,
        documents: {
          select: { documentType: true, regionId: true, status: true, expiresAt: true }
        },
        vehicles: {
          where: {
            isActive: true,
            seatCapacity: { gte: minimumCapacity },
            ...(requestedVehicleId ? { id: requestedVehicleId } : {})
          },
          orderBy: [{ year: 'desc' }, { seatCapacity: 'asc' }],
          include: {
            regionAccesses: true,
            documents: {
              select: { documentType: true, regionId: true, status: true, expiresAt: true }
            }
          }
        }
      }
    });

    if (
      !driver ||
      driver.status !== 'APPROVED' ||
      !['ONLINE', 'ON_TRIP'].includes(driver.availability) ||
      driver.user.status !== 'ACTIVE'
    ) {
      throw new ConflictException('السائق غير متاح أو غير معتمد.');
    }

    const requiredRegionIds = trip.routeId
      ? (
          await tx.routeRequiredRegion.findMany({
            where: { routeId: trip.routeId },
            select: { regionId: true }
          })
        ).map((entry) => entry.regionId)
      : [];
    const at = trip.travelDate ?? new Date();

    if (!this.hasAllRegions(driver.regionAccesses, requiredRegionIds, at)) {
      throw new ConflictException('السائق لا يملك صلاحيات الدخول المطلوبة لهذا المسار.');
    }

    const vehicle = driver.vehicles.find((candidate) =>
      this.hasAllRegions(candidate.regionAccesses, requiredRegionIds, at)
    );
    if (!vehicle) {
      throw new ConflictException(
        requestedVehicleId
          ? 'المركبة المحددة غير مؤهلة للمسار أو لا تلائم فئة السيارة المطلوبة.'
          : 'لا توجد مركبة فعالة ومؤهلة لهذا المسار وفئة السيارة المطلوبة.'
      );
    }

    await this.compliance.assertDriverVehicleCompliance(
      tx,
      driver.id,
      vehicle.id,
      requiredRegionIds,
      at
    );

    return { id: vehicle.id, seatCapacity: vehicle.seatCapacity };
  }

  private async attachToServiceRun(
    tx: Prisma.TransactionClient,
    trip: Trip,
    driverId: string,
    vehicle: ActiveVehicle
  ) {
    if (!trip.travelDate || !trip.bookingType || (!trip.routeId && !trip.direction)) {
      return null;
    }

    if (trip.passengerCount > vehicle.seatCapacity) {
      throw new ConflictException(
        `عدد المسافرين أكبر من سعة المركبة (${vehicle.seatCapacity}).`
      );
    }

    const { start, end } = this.dayBounds(trip.travelDate);

    const activeRuns = await tx.serviceRun.findMany({
      where: {
        driverId,
        travelDate: { gte: start, lt: end },
        status: { in: ACTIVE_RUN_STATUSES }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (trip.bookingType === 'PRIVATE_CAR' && activeRuns.length > 0) {
      throw new ConflictException(
        `لدى السائق رحلة مجدولة في هذا اليوم (${activeRuns[0].runReference}).`
      );
    }

    if (trip.bookingType === 'SHARED_SEAT') {
      const compatible = activeRuns.find(
        (run) =>
          run.bookingType === 'SHARED_SEAT' &&
          run.vehicleId === vehicle.id &&
          (trip.routeId ? run.routeId === trip.routeId : run.direction === trip.direction) &&
          run.reservedSeats + trip.passengerCount <= run.seatCapacity
      );

      if (compatible) {
        return tx.serviceRun.update({
          where: { id: compatible.id },
          data: {
            reservedSeats: { increment: trip.passengerCount },
            status: 'DRIVER_PENDING'
          }
        });
      }

      if (activeRuns.length > 0) {
        throw new ConflictException(
          `لدى السائق رحلة أخرى غير متوافقة في هذا اليوم (${activeRuns[0].runReference}).`
        );
      }
    }

    return tx.serviceRun.create({
      data: {
        runReference: await this.generateRunReference(tx),
        direction: trip.direction,
        routeId: trip.routeId,
        bookingType: trip.bookingType as BookingType,
        travelDate: trip.travelDate,
        driverId,
        vehicleId: vehicle.id,
        status: 'DRIVER_PENDING',
        seatCapacity: vehicle.seatCapacity,
        reservedSeats: trip.passengerCount
      }
    });
  }

  private async detachFromServiceRun(
    tx: Prisma.TransactionClient,
    trip: Pick<Trip, 'serviceRunId' | 'passengerCount'>
  ) {
    if (!trip.serviceRunId) return;

    const run = await tx.serviceRun.findUnique({ where: { id: trip.serviceRunId } });
    if (!run) return;

    const remaining = Math.max(0, run.reservedSeats - trip.passengerCount);
    await tx.serviceRun.update({
      where: { id: run.id },
      data: {
        reservedSeats: remaining,
        status: remaining === 0 ? 'CANCELLED' : 'PLANNED'
      }
    });
  }

  private hasAllRegions(
    accesses: RegionAccess[],
    requiredRegionIds: string[],
    at: Date
  ) {
    const eligible = new Set(
      accesses
        .filter(
          (entry) =>
            entry.status === 'APPROVED' &&
            (!entry.validFrom || entry.validFrom <= at) &&
            (!entry.validUntil || entry.validUntil >= at)
        )
        .map((entry) => entry.regionId)
    );
    return requiredRegionIds.every((regionId) => eligible.has(regionId));
  }

  private async generateRunReference(tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear().toString().slice(-2);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const reference = `RUN-${year}${randomInt(1000, 10000)}`;
      const exists = await tx.serviceRun.findUnique({
        where: { runReference: reference },
        select: { id: true }
      });
      if (!exists) return reference;
    }

    throw new ConflictException('تعذر إنشاء رقم تشغيل فريد.');
  }

  private dayBounds(value: Date) {
    const start = new Date(value);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private sanitizeTrip<T extends { startPinHash: string | null }>(
    trip: T
  ): Omit<T, 'startPinHash'> {
    const { startPinHash: _hidden, ...safeTrip } = trip;
    return safeTrip;
  }

  private toRealtimeEvent(
    trip: Pick<
      Trip,
      'id' | 'passengerId' | 'driverId' | 'status' | 'bookingReference' | 'bookingReviewStatus'
    >,
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
