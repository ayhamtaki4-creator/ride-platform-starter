import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  BookingType,
  Prisma,
  ServiceRunStatus,
  TripStatus
} from '@prisma/client';
import { randomInt } from 'crypto';
import { ComplianceService } from '../compliance/compliance.service';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateServiceRunDto } from './dto/create-service-run.dto';
import { ReplaceRunDriverDto } from './dto/replace-run-driver.dto';

const EDITABLE_RUN_STATUSES: ServiceRunStatus[] = [
  'DRAFT',
  'PLANNED',
  'SCHEDULED',
  'DRIVER_PENDING',
  'DRIVER_ACCEPTED',
  'DRIVER_REPLACEMENT_REQUIRED'
];

const DRIVER_CONFLICT_STATUSES: ServiceRunStatus[] = [
  'SCHEDULED',
  'DRIVER_PENDING',
  'DRIVER_ACCEPTED',
  'BOARDING',
  'IN_PROGRESS'
];

const runInclude = {
  route: {
    include: {
      origin: true,
      destination: true,
      requiredRegions: { include: { region: true } }
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
          status: true,
          availability: true,
          avatarUrl: true,
          baseRegion: true
        }
      }
    }
  },
  vehicle: {
    include: {
      baseRegion: true,
      regionAccesses: { include: { region: true } },
      images: {
        where: { isApproved: true },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }]
      }
    }
  },
  bookings: {
    orderBy: [{ pickupOrder: 'asc' as const }, { requestedAt: 'asc' as const }],
    include: {
      route: { include: { origin: true, destination: true } },
      passenger: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true
        }
      },
      statusHistory: { orderBy: { createdAt: 'asc' as const } }
    }
  }
} satisfies Prisma.ServiceRunInclude;

type RunWithRelations = Prisma.ServiceRunGetPayload<{ include: typeof runInclude }>;

type DriverVehicle = {
  driverId: string;
  vehicle: {
    id: string;
    seatCapacity: number;
    make: string;
    model: string;
    plateNumber: string;
  };
};

@Injectable()
export class AdminRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
    private readonly compliance: ComplianceService
  ) {}

  async list(status?: ServiceRunStatus, date?: string, search?: string) {
    const where: Prisma.ServiceRunWhereInput = {
      ...(status ? { status } : {}),
      ...(date ? { travelDate: this.dateFilter(date) } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { runReference: { contains: search.trim(), mode: 'insensitive' } },
              {
                driver: {
                  OR: [
                    { firstName: { contains: search.trim(), mode: 'insensitive' } },
                    { lastName: { contains: search.trim(), mode: 'insensitive' } }
                  ]
                }
              },
              {
                route: {
                  OR: [
                    { code: { contains: search.trim(), mode: 'insensitive' } },
                    { nameAr: { contains: search.trim(), mode: 'insensitive' } },
                    { nameEn: { contains: search.trim(), mode: 'insensitive' } }
                  ]
                }
              },
              {
                bookings: {
                  some: {
                    OR: [
                      {
                        bookingReference: {
                          contains: search.trim(),
                          mode: 'insensitive'
                        }
                      },
                      {
                        contactName: {
                          contains: search.trim(),
                          mode: 'insensitive'
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    };

    const runs = await this.prisma.serviceRun.findMany({
      where,
      orderBy: [{ travelDate: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: runInclude
    });

    return runs.map((run) => this.serialize(run));
  }

  async detail(id: string) {
    const run = await this.prisma.serviceRun.findUnique({
      where: { id },
      include: runInclude
    });

    if (!run) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
    return this.serialize(run);
  }

  async create(actor: AuthUser, dto: CreateServiceRunDto) {
    const travelDate = new Date(dto.travelDate);
    if (Number.isNaN(travelDate.getTime())) {
      throw new ConflictException('تاريخ الرحلة غير صحيح.');
    }
    if (Boolean(dto.routeId) === Boolean(dto.direction)) {
      throw new ConflictException('يجب تحديد routeId أو direction، وليس كليهما.');
    }

    const run = await this.prisma.$transaction(async (tx) => {
      if (dto.routeId) {
        const route = await tx.serviceRoute.findFirst({
          where: { id: dto.routeId, isActive: true },
          select: { id: true }
        });
        if (!route) throw new NotFoundException('المسار غير موجود أو غير فعال.');
      }
      const assignment = await this.assertDriverVehicle(
        tx,
        dto.driverId,
        dto.vehicleId,
        dto.routeId,
        travelDate
      );
      await this.assertNoDriverConflict(tx, dto.driverId, travelDate);

      const created = await tx.serviceRun.create({
        data: {
          runReference: await this.generateRunReference(tx),
          direction: dto.direction,
          routeId: dto.routeId,
          bookingType: dto.bookingType,
          travelDate,
          driverId: dto.driverId,
          vehicleId: assignment.vehicle.id,
          status: 'DRAFT',
          seatCapacity: assignment.vehicle.seatCapacity,
          reservedSeats: 0,
          notes: dto.notes?.trim() || null
        },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.create',
          entityType: 'ServiceRun',
          entityId: created.id,
          metadata: {
            runReference: created.runReference,
            direction: created.direction,
            routeId: created.routeId,
            bookingType: created.bookingType,
            driverId: created.driverId,
            vehicleId: created.vehicleId,
            travelDate: created.travelDate.toISOString()
          }
        }
      });

      return created;
    });

    this.realtime.runCreated(this.toRealtimeEvent(run));
    return this.serialize(run);
  }

  async addBooking(actor: AuthUser, runId: string, bookingId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const run = await tx.serviceRun.findUnique({ where: { id: runId } });
      const booking = await tx.trip.findUnique({ where: { id: bookingId } });

      if (!run) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
      if (!booking?.bookingReference) {
        throw new NotFoundException('الحجز غير موجود.');
      }

      this.assertRunEditable(run.status);
      this.assertBookingCompatible(run, booking);

      if (booking.serviceRunId === run.id) {
        throw new ConflictException('الحجز موجود بالفعل ضمن هذه الرحلة.');
      }
      if (booking.serviceRunId) {
        throw new ConflictException('الحجز مرتبط برحلة أخرى. استخدم النقل.');
      }
      if (booking.driverId && booking.driverId !== run.driverId) {
        throw new ConflictException('الحجز معيّن حاليًا لسائق آخر.');
      }

      const nextReserved = run.reservedSeats + booking.passengerCount;
      if (nextReserved > run.seatCapacity) {
        throw new ConflictException(
          `لا توجد مقاعد كافية. السعة ${run.seatCapacity} والمحجوز ${run.reservedSeats}.`
        );
      }

      const lastPickup = await tx.trip.aggregate({
        where: { serviceRunId: run.id },
        _max: { pickupOrder: true }
      });

      const previousStatus = booking.status;
      await tx.trip.update({
        where: { id: booking.id },
        data: {
          driverId: run.driverId,
          serviceRunId: run.id,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING',
          assignedAt: new Date(),
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null,
          pickupOrder: (lastPickup._max.pickupOrder ?? 0) + 1,
          serviceRunPassengerStatus: 'WAITING',
          pickedUpAt: null,
          noShowAt: null,
          droppedOffAt: null
        }
      });

      const nextRunStatus: ServiceRunStatus =
        run.status === 'DRAFT' || run.status === 'PLANNED'
          ? 'DRAFT'
          : 'SCHEDULED';

      await tx.serviceRun.update({
        where: { id: run.id },
        data: {
          reservedSeats: nextReserved,
          status: nextRunStatus,
          driverAcceptedAt: nextRunStatus === 'SCHEDULED' ? null : run.driverAcceptedAt
        }
      });

      if (previousStatus !== 'DRIVER_ASSIGNED') {
        await tx.tripStatusHistory.create({
          data: {
            tripId: booking.id,
            from: previousStatus,
            to: 'DRIVER_ASSIGNED',
            actorId: actor.sub,
            note: `Added to service run ${run.runReference}`
          }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.booking.add',
          entityType: 'ServiceRun',
          entityId: run.id,
          metadata: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference,
            passengerCount: booking.passengerCount
          }
        }
      });

      return {
        run: await tx.serviceRun.findUniqueOrThrow({
          where: { id: run.id },
          include: runInclude
        }),
        booking: await tx.trip.findUniqueOrThrow({ where: { id: booking.id } })
      };
    });

    this.realtime.runUpdated(this.toRealtimeEvent(result.run));
    this.realtime.tripAssigned(this.toTripEvent(result.booking));
    return this.serialize(result.run);
  }

  async removeBooking(actor: AuthUser, runId: string, bookingId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const run = await tx.serviceRun.findUnique({ where: { id: runId } });
      const booking = await tx.trip.findUnique({ where: { id: bookingId } });

      if (!run) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
      if (!booking || booking.serviceRunId !== run.id) {
        throw new NotFoundException('الحجز غير موجود ضمن هذه الرحلة.');
      }

      this.assertRunEditable(run.status);
      const previousStatus = booking.status;
      const remaining = Math.max(0, run.reservedSeats - booking.passengerCount);

      await tx.trip.update({
        where: { id: booking.id },
        data: {
          driverId: null,
          serviceRunId: null,
          status: 'PENDING_DISPATCH',
          driverAssignmentStatus: 'UNASSIGNED',
          assignedAt: null,
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null,
          pickupOrder: null,
          serviceRunPassengerStatus: 'WAITING',
          pickedUpAt: null,
          noShowAt: null,
          droppedOffAt: null
        }
      });

      await tx.serviceRun.update({
        where: { id: run.id },
        data: {
          reservedSeats: remaining,
          status: remaining === 0 ? 'DRAFT' : 'SCHEDULED',
          driverAcceptedAt: null
        }
      });

      await tx.tripStatusHistory.create({
        data: {
          tripId: booking.id,
          from: previousStatus,
          to: 'PENDING_DISPATCH',
          actorId: actor.sub,
          note: `Removed from service run ${run.runReference}`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.booking.remove',
          entityType: 'ServiceRun',
          entityId: run.id,
          metadata: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference
          }
        }
      });

      return {
        run: await tx.serviceRun.findUniqueOrThrow({
          where: { id: run.id },
          include: runInclude
        }),
        booking: await tx.trip.findUniqueOrThrow({ where: { id: booking.id } }),
        previousDriverId: booking.driverId
      };
    });

    this.realtime.runUpdated(this.toRealtimeEvent(result.run));
    this.realtime.tripUnassigned(
      this.toTripEvent(result.booking, {
        previousDriverId: result.previousDriverId,
        reason: 'Removed from operational run'
      })
    );
    return this.serialize(result.run);
  }

  async moveBooking(
    actor: AuthUser,
    sourceRunId: string,
    bookingId: string,
    targetRunId: string
  ) {
    if (sourceRunId === targetRunId) {
      throw new ConflictException('الرحلة المصدر والهدف متطابقتان.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [source, target, booking] = await Promise.all([
        tx.serviceRun.findUnique({ where: { id: sourceRunId } }),
        tx.serviceRun.findUnique({ where: { id: targetRunId } }),
        tx.trip.findUnique({ where: { id: bookingId } })
      ]);

      if (!source || !target) {
        throw new NotFoundException('إحدى الرحلتين غير موجودة.');
      }
      if (!booking || booking.serviceRunId !== source.id) {
        throw new NotFoundException('الحجز غير موجود ضمن الرحلة المصدر.');
      }

      this.assertRunEditable(source.status);
      this.assertRunEditable(target.status);
      this.assertBookingCompatible(target, booking);

      if (target.reservedSeats + booking.passengerCount > target.seatCapacity) {
        throw new ConflictException('سعة الرحلة الهدف غير كافية.');
      }

      const lastPickup = await tx.trip.aggregate({
        where: { serviceRunId: target.id },
        _max: { pickupOrder: true }
      });

      await tx.trip.update({
        where: { id: booking.id },
        data: {
          serviceRunId: target.id,
          driverId: target.driverId,
          driverAssignmentStatus: 'PENDING',
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null,
          pickupOrder: (lastPickup._max.pickupOrder ?? 0) + 1,
          serviceRunPassengerStatus: 'WAITING',
          pickedUpAt: null,
          noShowAt: null,
          droppedOffAt: null
        }
      });

      const sourceRemaining = Math.max(
        0,
        source.reservedSeats - booking.passengerCount
      );

      await tx.serviceRun.update({
        where: { id: source.id },
        data: {
          reservedSeats: sourceRemaining,
          status: sourceRemaining === 0 ? 'DRAFT' : 'SCHEDULED',
          driverAcceptedAt: null
        }
      });

      await tx.serviceRun.update({
        where: { id: target.id },
        data: {
          reservedSeats: { increment: booking.passengerCount },
          status: 'SCHEDULED',
          driverAcceptedAt: null
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.booking.move',
          entityType: 'Trip',
          entityId: booking.id,
          metadata: {
            fromRunId: source.id,
            fromRunReference: source.runReference,
            toRunId: target.id,
            toRunReference: target.runReference
          }
        }
      });

      return {
        source: await tx.serviceRun.findUniqueOrThrow({
          where: { id: source.id },
          include: runInclude
        }),
        target: await tx.serviceRun.findUniqueOrThrow({
          where: { id: target.id },
          include: runInclude
        }),
        booking: await tx.trip.findUniqueOrThrow({ where: { id: booking.id } }),
        previousDriverId: source.driverId
      };
    });

    this.realtime.runUpdated(this.toRealtimeEvent(result.source));
    this.realtime.runUpdated(this.toRealtimeEvent(result.target));
    this.realtime.tripReassigned(
      this.toTripEvent(result.booking, {
        previousDriverId: result.previousDriverId,
        reason: `Moved to ${result.target.runReference}`
      })
    );

    return this.serialize(result.target);
  }

  async schedule(actor: AuthUser, runId: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({
        where: { id: runId },
        include: { bookings: { select: { id: true } } }
      });

      if (!current) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
      this.assertRunEditable(current.status);
      if (current.bookings.length === 0) {
        throw new ConflictException('أضف حجزًا واحدًا على الأقل قبل الجدولة.');
      }

      await this.assertDriverVehicle(
        tx,
        current.driverId,
        current.vehicleId,
        current.routeId ?? undefined,
        current.travelDate
      );
      await this.assertNoDriverConflict(
        tx,
        current.driverId,
        current.travelDate,
        current.id
      );

      await tx.trip.updateMany({
        where: { serviceRunId: current.id },
        data: {
          driverId: current.driverId,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING',
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null
        }
      });

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: {
          status: 'SCHEDULED',
          driverAcceptedAt: null,
          driverRejectionReason: null
        },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.schedule',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: { runReference: current.runReference }
        }
      });

      return updated;
    });

    this.realtime.runDriverAssigned(this.toRealtimeEvent(run));
    return this.serialize(run);
  }

  async replaceDriver(
    actor: AuthUser,
    runId: string,
    dto: ReplaceRunDriverDto
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({ where: { id: runId } });
      if (!current) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
      this.assertRunEditable(current.status);

      const previousDriverId = current.driverId;
      const assignment = await this.assertDriverVehicle(
        tx,
        dto.driverId,
        dto.vehicleId,
        current.routeId ?? undefined,
        current.travelDate
      );

      if (current.reservedSeats > assignment.vehicle.seatCapacity) {
        throw new ConflictException(
          `المركبة الجديدة لا تتسع للمقاعد المحجوزة (${current.reservedSeats}).`
        );
      }

      await this.assertNoDriverConflict(
        tx,
        dto.driverId,
        current.travelDate,
        current.id
      );

      await tx.trip.updateMany({
        where: { serviceRunId: current.id },
        data: {
          driverId: dto.driverId,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING',
          assignedAt: new Date(),
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null
        }
      });

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: {
          driverId: dto.driverId,
          vehicleId: assignment.vehicle.id,
          seatCapacity: assignment.vehicle.seatCapacity,
          status: 'SCHEDULED',
          driverAcceptedAt: null,
          driverRejectionReason: null
        },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.driver.replace',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: {
            previousDriverId,
            driverId: dto.driverId,
            vehicleId: assignment.vehicle.id,
            note: dto.note?.trim() || null
          }
        }
      });

      return { updated, previousDriverId };
    });

    this.realtime.runDriverAssigned(
      this.toRealtimeEvent(result.updated, {
        previousDriverId: result.previousDriverId,
        reason: dto.note?.trim() || null
      })
    );

    return this.serialize(result.updated);
  }

  async cancel(actor: AuthUser, runId: string, note?: string) {
    const run = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceRun.findUnique({ where: { id: runId } });
      if (!current) throw new NotFoundException('الرحلة التشغيلية غير موجودة.');
      if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
        throw new ConflictException('لا يمكن إلغاء الرحلة في حالتها الحالية.');
      }

      const bookings = await tx.trip.findMany({
        where: { serviceRunId: current.id },
        select: { id: true, status: true }
      });

      await tx.trip.updateMany({
        where: {
          serviceRunId: current.id,
          status: { notIn: ['COMPLETED', 'PASSENGER_NO_SHOW'] }
        },
        data: {
          driverId: null,
          status: 'PENDING_DISPATCH',
          driverAssignmentStatus: 'UNASSIGNED',
          assignedAt: null,
          driverRespondedAt: null,
          driverRejectionReason: null,
          acceptedAt: null
        }
      });

      for (const booking of bookings) {
        if (!['COMPLETED', 'PASSENGER_NO_SHOW'].includes(booking.status)) {
          await tx.tripStatusHistory.create({
            data: {
              tripId: booking.id,
              from: booking.status,
              to: 'PENDING_DISPATCH',
              actorId: actor.sub,
              note: note?.trim() || `Service run ${current.runReference} cancelled`
            }
          });
        }
      }

      const updated = await tx.serviceRun.update({
        where: { id: current.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          driverRejectionReason: note?.trim() || null
        },
        include: runInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_run.cancel',
          entityType: 'ServiceRun',
          entityId: current.id,
          metadata: {
            runReference: current.runReference,
            note: note?.trim() || null,
            bookings: bookings.length
          }
        }
      });

      return updated;
    });

    this.realtime.runUpdated(
      this.toRealtimeEvent(run, { reason: note?.trim() || null })
    );
    return this.serialize(run);
  }

  private assertRunEditable(status: ServiceRunStatus) {
    if (!EDITABLE_RUN_STATUSES.includes(status)) {
      throw new ConflictException('لا يمكن تعديل الرحلة بعد بدء التنفيذ.');
    }
  }

  private assertBookingCompatible(
    run: {
      routeId: string | null;
      direction: string | null;
      bookingType: BookingType;
      travelDate: Date;
      reservedSeats: number;
    },
    booking: {
      bookingReviewStatus: string;
      routeId: string | null;
      direction: string | null;
      bookingType: BookingType | null;
      travelDate: Date | null;
    }
  ) {
    if (booking.bookingReviewStatus !== 'CONFIRMED') {
      throw new ConflictException('يجب تأكيد الحجز قبل إضافته للرحلة.');
    }
    if (run.routeId) {
      if (booking.routeId !== run.routeId) {
        throw new ConflictException('مسار الحجز لا يطابق مسار الرحلة.');
      }
    } else if (!booking.direction || booking.direction !== run.direction) {
      throw new ConflictException('اتجاه الحجز لا يطابق اتجاه الرحلة.');
    }
    if (!booking.bookingType || booking.bookingType !== run.bookingType) {
      throw new ConflictException('نوع الحجز لا يطابق نوع الرحلة.');
    }
    if (!booking.travelDate || !this.isSameDay(booking.travelDate, run.travelDate)) {
      throw new ConflictException('تاريخ الحجز لا يطابق تاريخ الرحلة.');
    }
    if (run.bookingType === 'PRIVATE_CAR' && run.reservedSeats > 0) {
      throw new ConflictException('رحلة السيارة الخاصة تقبل حجزًا واحدًا فقط.');
    }
  }

  private async assertDriverVehicle(
    tx: Prisma.TransactionClient,
    driverId: string,
    requestedVehicleId?: string,
    routeId?: string,
    travelDate: Date = new Date()
  ): Promise<DriverVehicle> {
    const profile = await tx.driverProfile.findUnique({
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
            ...(requestedVehicleId ? { id: requestedVehicleId } : {})
          },
          orderBy: { year: 'desc' },
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
      !profile ||
      profile.status !== 'APPROVED' ||
      profile.user.status !== 'ACTIVE'
    ) {
      throw new ConflictException('السائق غير معتمد أو حسابه غير نشط.');
    }

    const requiredRegionIds = routeId
      ? (
          await tx.routeRequiredRegion.findMany({
            where: { routeId },
            select: { regionId: true }
          })
        ).map((entry) => entry.regionId)
      : [];

    if (!this.hasAllRegions(profile.regionAccesses, requiredRegionIds, travelDate)) {
      throw new ConflictException('السائق لا يملك صلاحيات الدخول المطلوبة للمسار.');
    }

    const vehicle = profile.vehicles.find((candidate) =>
      this.hasAllRegions(candidate.regionAccesses, requiredRegionIds, travelDate)
    );
    if (!vehicle) {
      throw new ConflictException('المركبة غير معتمدة أو غير مسموح لها بدخول مناطق المسار.');
    }

    await this.compliance.assertDriverVehicleCompliance(
      tx,
      profile.id,
      vehicle.id,
      requiredRegionIds,
      travelDate
    );

    return {
      driverId,
      vehicle: {
        id: vehicle.id,
        seatCapacity: vehicle.seatCapacity,
        make: vehicle.make,
        model: vehicle.model,
        plateNumber: vehicle.plateNumber
      }
    };
  }

  private hasAllRegions(
    accesses: Array<{
      regionId: string;
      status: string;
      validFrom: Date | null;
      validUntil: Date | null;
    }>,
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

  private async assertNoDriverConflict(
    tx: Prisma.TransactionClient,
    driverId: string,
    travelDate: Date,
    excludedRunId?: string
  ) {
    const { gte: start, lt: end } = this.dayBounds(travelDate);
    const conflict = await tx.serviceRun.findFirst({
      where: {
        driverId,
        id: excludedRunId ? { not: excludedRunId } : undefined,
        travelDate: { gte: start, lt: end },
        status: { in: DRIVER_CONFLICT_STATUSES }
      },
      select: { runReference: true }
    });

    if (conflict) {
      throw new ConflictException(
        `لدى السائق رحلة تشغيلية أخرى في اليوم نفسه (${conflict.runReference}).`
      );
    }
  }

  private serialize(run: RunWithRelations) {
    const bookings = run.bookings.map((booking) => {
      const { startPinHash: _hidden, ...safe } = booking;
      return safe;
    });

    const grossRevenue = bookings.reduce(
      (sum, booking) => sum + Number(booking.finalFare ?? booking.estimatedFare),
      0
    );
    const driverFees = bookings.reduce(
      (sum, booking) => sum + Number(booking.driverFee),
      0
    );
    const platformMargin = bookings.reduce(
      (sum, booking) => sum + Number(booking.platformMargin),
      0
    );
    const luggageCount = bookings.reduce(
      (sum, booking) => sum + booking.luggageCount,
      0
    );

    return {
      ...run,
      bookings,
      report: {
        bookingCount: bookings.length,
        passengerCount: bookings.reduce(
          (sum, booking) => sum + booking.passengerCount,
          0
        ),
        luggageCount,
        grossRevenue,
        driverFees,
        platformMargin,
        occupancyPercent:
          run.seatCapacity > 0
            ? Math.round((run.reservedSeats / run.seatCapacity) * 100)
            : 0,
        waitingCount: bookings.filter(
          (booking) => booking.serviceRunPassengerStatus === 'WAITING'
        ).length,
        pickedUpCount: bookings.filter(
          (booking) => booking.serviceRunPassengerStatus === 'PICKED_UP'
        ).length,
        noShowCount: bookings.filter(
          (booking) => booking.serviceRunPassengerStatus === 'NO_SHOW'
        ).length,
        droppedOffCount: bookings.filter(
          (booking) => booking.serviceRunPassengerStatus === 'DROPPED_OFF'
        ).length
      }
    };
  }

  private toRealtimeEvent(
    run: RunWithRelations,
    extra?: { previousDriverId?: string | null; reason?: string | null }
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

  private toTripEvent(
    trip: {
      id: string;
      passengerId: string;
      driverId: string | null;
      status: TripStatus;
      bookingReference: string | null;
      bookingReviewStatus: string;
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

  private async generateRunReference(tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear().toString().slice(-2);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reference = `RUN-${year}${randomInt(10000, 100000)}`;
      const exists = await tx.serviceRun.findUnique({
        where: { runReference: reference },
        select: { id: true }
      });
      if (!exists) return reference;
    }
    throw new ConflictException('تعذر إنشاء رقم رحلة تشغيلية فريد.');
  }

  private dateFilter(value: string): Prisma.DateTimeFilter {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException('صيغة التاريخ غير صحيحة.');
    }
    return this.dayBounds(parsed);
  }

  private dayBounds(value: Date) {
    const start = new Date(value);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }

  private isSameDay(left: Date, right: Date) {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }
}
