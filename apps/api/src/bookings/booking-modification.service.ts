import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, VehicleClass } from '@prisma/client';
import {
  isPastServiceDate,
  parseDateOnly,
  utcDayBounds
} from '../common/service-date';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  defaultVehicleClassCapacity,
  defaultVehicleClassLuggageCapacity
} from '../pricing/vehicle-class';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { BookingRoutePlanService } from './booking-route-plan.service';
import { UpdateBookingDto } from './dto/update-booking.dto';

type ModificationMode = 'PASSENGER' | 'ADMIN';

type RouteBookingPolicyRow = {
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
};

const PASSENGER_EDITABLE_STATUSES = new Set([
  'PENDING_DISPATCH',
  'SEARCHING_DRIVER'
]);

const ADMIN_EDITABLE_STATUSES = new Set([
  'PENDING_DISPATCH',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED'
]);

@Injectable()
export class BookingModificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
    private readonly routePlans: BookingRoutePlanService
  ) {}

  updatePassenger(actor: AuthUser, tripId: string, dto: UpdateBookingDto) {
    return this.update(actor, tripId, dto, 'PASSENGER');
  }

  updateAdmin(actor: AuthUser, tripId: string, dto: UpdateBookingDto) {
    return this.update(actor, tripId, dto, 'ADMIN');
  }

  private async update(
    actor: AuthUser,
    tripId: string,
    dto: UpdateBookingDto,
    mode: ModificationMode
  ) {
    const notifications: Array<{
      id: string;
      userId: string;
      type: string;
      title: string;
      message: string;
      entityType: string | null;
      entityId: string | null;
      link: string | null;
      readAt: Date | null;
      createdAt: Date;
      metadata: Prisma.JsonValue | null;
    }> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "Trip"
        WHERE "id" = ${tripId}::uuid
        FOR UPDATE
      `);

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          route: { include: { origin: true, destination: true } },
          serviceRun: true
        }
      });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (mode === 'PASSENGER' && trip.passengerId !== actor.sub) {
        throw new ForbiddenException('لا يمكنك تعديل حجز لا يخص حسابك.');
      }

      this.assertEditable(trip, mode, dto);

      if (trip.bookingType && trip.bookingType !== 'PRIVATE_CAR') {
        throw new ConflictException('لا يمكن تعديل هذا الحجز القديم من الواجهة الحالية.');
      }

      const targetTravelDate = dto.travelDate
        ? parseDateOnly(dto.travelDate)
        : trip.travelDate;
      if (!targetTravelDate || isPastServiceDate(targetTravelDate)) {
        throw new BadRequestException('يجب اختيار تاريخ رحلة صالح وغير ماضٍ.');
      }

      const targetVehicleClass = dto.vehicleClass ?? trip.vehicleClass;
      const targetPassengerCount = dto.passengerCount ?? trip.passengerCount;
      const targetLuggageCount = dto.luggageCount ?? trip.luggageCount;
      const targetFlightArrivalTime = this.normalizedOptional(
        dto.flightArrivalTime,
        trip.flightArrivalTime
      );
      const targetFlightNumber = this.normalizedOptional(
        dto.flightNumber,
        trip.flightNumber
      );

      if (
        trip.route?.requiresFlightDetails &&
        (!targetFlightArrivalTime || !targetFlightNumber)
      ) {
        throw new BadRequestException(
          'هذا المسار يتطلب وقت وصول الطائرة ورقم الرحلة الجوية.'
        );
      }

      const targetEndpoints = await this.resolveEndpoints(tx, trip, dto, mode);
      const pricing = await this.resolvePricing(
        tx,
        trip.routeId,
        trip.direction,
        targetVehicleClass,
        targetPassengerCount,
        targetLuggageCount
      );

      const travelDateChanged =
        !trip.travelDate || trip.travelDate.getTime() !== targetTravelDate.getTime();
      const endpointChanged =
        targetEndpoints.pickupAddress !== trip.pickupAddress ||
        targetEndpoints.pickupLatitude !== trip.pickupLatitude ||
        targetEndpoints.pickupLongitude !== trip.pickupLongitude ||
        targetEndpoints.dropoffAddress !== trip.dropoffAddress ||
        targetEndpoints.dropoffLatitude !== trip.dropoffLatitude ||
        targetEndpoints.dropoffLongitude !== trip.dropoffLongitude;
      const passengerCountChanged = targetPassengerCount !== trip.passengerCount;
      const vehicleClassChanged = targetVehicleClass !== trip.vehicleClass;

      if (trip.serviceRunId) {
        if (travelDateChanged) {
          throw new ConflictException(
            'الحجز مرتبط برحلة تشغيلية. افصل الحجز من الرحلة التشغيلية قبل تغيير التاريخ.'
          );
        }
        if (vehicleClassChanged) {
          throw new ConflictException(
            'لا يمكن تغيير فئة السيارة بعد ربط الحجز برحلة تشغيلية.'
          );
        }
        if (endpointChanged) {
          throw new ConflictException(
            'لا يمكن تغيير نقاط المسار بعد ربط الحجز برحلة تشغيلية.'
          );
        }
      }

      if (trip.driverId && endpointChanged) {
        throw new ConflictException(
          'تم تعيين سائق لهذا الحجز. ألغِ التعيين أولًا قبل تغيير نقطة الانطلاق أو الوصول.'
        );
      }

      if (trip.driverId && travelDateChanged && !trip.serviceRunId) {
        await this.assertDriverAvailableOnDate(tx, trip.driverId, trip.id, targetTravelDate);
      }

      if (trip.driverId && passengerCountChanged && !trip.serviceRunId) {
        const vehicle = await tx.vehicle.findFirst({
          where: {
            isActive: true,
            driverProfile: { userId: trip.driverId },
            seatCapacity: { gte: targetPassengerCount }
          },
          select: { id: true }
        });
        if (!vehicle) {
          throw new ConflictException(
            'عدد الركاب الجديد يتجاوز سعة المركبات الفعالة للسائق المعيّن. أعد تعيين السائق أولًا.'
          );
        }
      }

      if (trip.serviceRun && passengerCountChanged) {
        const delta = targetPassengerCount - trip.passengerCount;
        const nextReserved = trip.serviceRun.reservedSeats + delta;
        if (nextReserved < 0 || nextReserved > trip.serviceRun.seatCapacity) {
          throw new ConflictException('لا توجد سعة كافية في الرحلة التشغيلية لعدد الركاب الجديد.');
        }
        const runUpdate = await tx.serviceRun.updateMany({
          where: {
            id: trip.serviceRun.id,
            reservedSeats: trip.serviceRun.reservedSeats,
            status: { not: 'CANCELLED' }
          },
          data: { reservedSeats: nextReserved }
        });
        if (runUpdate.count !== 1) {
          throw new ConflictException('تغيرت سعة الرحلة التشغيلية. أعد المحاولة.');
        }
      }

      const data: Prisma.TripUncheckedUpdateInput = {
        travelDate: targetTravelDate,
        flightArrivalTime: targetFlightArrivalTime,
        flightNumber: targetFlightNumber,
        vehicleClass: targetVehicleClass,
        passengerCount: targetPassengerCount,
        luggageCount: targetLuggageCount,
        pickupAddress: targetEndpoints.pickupAddress,
        pickupLatitude: targetEndpoints.pickupLatitude,
        pickupLongitude: targetEndpoints.pickupLongitude,
        dropoffAddress: targetEndpoints.dropoffAddress,
        dropoffLatitude: targetEndpoints.dropoffLatitude,
        dropoffLongitude: targetEndpoints.dropoffLongitude,
        contactName: dto.passengerName?.trim() ?? trip.contactName,
        contactPhone: dto.passengerPhone?.trim() ?? trip.contactPhone,
        notes:
          dto.notes === undefined
            ? trip.notes
            : dto.notes?.trim() || null,
        pricingRuleId: pricing.pricingRuleId,
        estimatedFare: pricing.passengerPrice,
        driverFee: pricing.driverFee,
        platformMargin: pricing.platformMargin,
        currency: pricing.currency
      };

      const changed = this.changedFields(trip, data);
      if (changed.length === 0) {
        throw new BadRequestException('لا توجد تعديلات جديدة على الحجز.');
      }

      const updated = await tx.trip.update({
        where: { id: trip.id },
        data,
        include: {
          route: { include: { origin: true, destination: true } },
          pricingRule: true,
          serviceRun: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: mode === 'PASSENGER' ? 'booking.update.own' : 'booking.update.admin',
          entityType: 'Trip',
          entityId: trip.id,
          metadata: {
            changedFields: changed,
            changeNote: dto.changeNote?.trim() || null,
            previous: this.auditSnapshot(trip),
            current: this.auditSnapshot(updated)
          }
        }
      });

      if (mode === 'ADMIN') {
        const passengerNotification = await tx.notification.create({
          data: {
            userId: trip.passengerId,
            type: 'BOOKING_DETAILS_UPDATED',
            title: 'تم تعديل تفاصيل الحجز',
            message: trip.bookingReference
              ? `قام مركز العمليات بتحديث تفاصيل الحجز ${trip.bookingReference}. راجع التاريخ والبيانات قبل الرحلة.`
              : 'قام مركز العمليات بتحديث تفاصيل حجزك. راجع البيانات قبل الرحلة.',
            entityType: 'Trip',
            entityId: trip.id,
            link: `/rider/bookings/${trip.id}`,
            dedupeKey: `booking-details-updated:${trip.id}:${Date.now()}:${trip.passengerId}`,
            metadata: {
              changedFields: changed,
              changeNote: dto.changeNote?.trim() || null
            }
          }
        });
        notifications.push(passengerNotification);

        if (trip.driverId) {
          const driverNotification = await tx.notification.create({
            data: {
              userId: trip.driverId,
              type: 'DRIVER_BOOKING_DETAILS_UPDATED',
              title: 'تم تعديل بيانات الرحلة',
              message: 'قام مركز العمليات بتعديل حجز معيّن لك. راجع التاريخ والتفاصيل قبل التحرك.',
              entityType: 'Trip',
              entityId: trip.id,
              link: '/driver/bookings',
              dedupeKey: `driver-booking-details-updated:${trip.id}:${Date.now()}:${trip.driverId}`,
              metadata: {
                changedFields: changed,
                changeNote: dto.changeNote?.trim() || null
              }
            }
          });
          notifications.push(driverNotification);
        }
      }

      return { updated, endpointChanged };
    });

    if (result.endpointChanged) {
      void this.routePlans.syncPendingBooking(tripId);
    }

    const event = {
      tripId: result.updated.id,
      passengerId: result.updated.passengerId,
      driverId: result.updated.driverId,
      status: result.updated.status,
      bookingReference: result.updated.bookingReference,
      occurredAt: new Date().toISOString(),
      reason: dto.changeNote?.trim() || 'تم تعديل تفاصيل الحجز'
    };
    this.realtime.bookingUpdated(event);

    for (const notification of notifications) {
      this.realtime.notificationCreated({
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        entityType: notification.entityType,
        entityId: notification.entityId,
        link: notification.link,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
        metadata: notification.metadata
      });
    }

    return result.updated;
  }

  private assertEditable(
    trip: {
      status: string;
      bookingReviewStatus: string;
      driverId: string | null;
      serviceRunId: string | null;
    },
    mode: ModificationMode,
    dto: UpdateBookingDto
  ) {
    const allowed = mode === 'PASSENGER' ? PASSENGER_EDITABLE_STATUSES : ADMIN_EDITABLE_STATUSES;
    if (!allowed.has(trip.status)) {
      throw new ConflictException('لا يمكن تعديل الحجز بعد بدء الرحلة أو إنهائها/إلغائها.');
    }
    if (trip.bookingReviewStatus === 'REJECTED' || trip.bookingReviewStatus === 'CANCELLED') {
      throw new ConflictException('لا يمكن تعديل حجز مرفوض أو ملغى.');
    }
    if (mode === 'PASSENGER' && (trip.driverId || trip.serviceRunId)) {
      throw new ConflictException(
        'تم تعيين الحجز للتشغيل. تواصل مع مركز العمليات لإجراء هذا التعديل.'
      );
    }
    if (
      mode === 'ADMIN' &&
      (trip.driverId || trip.serviceRunId) &&
      !dto.changeNote?.trim()
    ) {
      throw new BadRequestException(
        'اكتب سبب التعديل عند تغيير حجز تم تعيينه لسائق أو رحلة تشغيلية.'
      );
    }
  }

  private async resolveEndpoints(
    tx: Prisma.TransactionClient,
    trip: {
      routeId: string | null;
      pickupAddress: string;
      pickupLatitude: number;
      pickupLongitude: number;
      dropoffAddress: string;
      dropoffLatitude: number;
      dropoffLongitude: number;
      route: {
        id: string;
        origin: { type: string };
        destination: { type: string };
      } | null;
    },
    dto: UpdateBookingDto,
    mode: ModificationMode
  ) {
    const pickupCoordinateTouched =
      dto.pickupLatitude !== undefined || dto.pickupLongitude !== undefined;
    const dropoffCoordinateTouched =
      dto.dropoffLatitude !== undefined || dto.dropoffLongitude !== undefined;

    if (
      pickupCoordinateTouched &&
      (dto.pickupLatitude === undefined || dto.pickupLongitude === undefined)
    ) {
      throw new BadRequestException('يجب إرسال إحداثيي نقطة الانطلاق معًا.');
    }
    if (
      dropoffCoordinateTouched &&
      (dto.dropoffLatitude === undefined || dto.dropoffLongitude === undefined)
    ) {
      throw new BadRequestException('يجب إرسال إحداثيي نقطة الوصول معًا.');
    }

    if (mode === 'PASSENGER' && trip.routeId && trip.route) {
      const policies = await tx.$queryRaw<RouteBookingPolicyRow[]>(Prisma.sql`
        SELECT "passengerCanEditPickup", "passengerCanEditDropoff"
        FROM "RouteBookingPolicy"
        WHERE "routeId" = ${trip.routeId}::uuid
        LIMIT 1
      `);
      const policy = policies[0] ?? {
        passengerCanEditPickup: trip.route.origin.type !== 'AIRPORT',
        passengerCanEditDropoff: trip.route.destination.type !== 'AIRPORT'
      };

      if (
        !policy.passengerCanEditPickup &&
        (dto.pickupAddress !== undefined || pickupCoordinateTouched)
      ) {
        throw new BadRequestException('لا يسمح هذا المسار للمسافر بتعديل نقطة الانطلاق.');
      }
      if (
        !policy.passengerCanEditDropoff &&
        (dto.dropoffAddress !== undefined || dropoffCoordinateTouched)
      ) {
        throw new BadRequestException('لا يسمح هذا المسار للمسافر بتعديل نقطة الوصول.');
      }
    }

    return {
      pickupAddress: dto.pickupAddress?.trim() ?? trip.pickupAddress,
      pickupLatitude: dto.pickupLatitude ?? trip.pickupLatitude,
      pickupLongitude: dto.pickupLongitude ?? trip.pickupLongitude,
      dropoffAddress: dto.dropoffAddress?.trim() ?? trip.dropoffAddress,
      dropoffLatitude: dto.dropoffLatitude ?? trip.dropoffLatitude,
      dropoffLongitude: dto.dropoffLongitude ?? trip.dropoffLongitude
    };
  }

  private async resolvePricing(
    tx: Prisma.TransactionClient,
    routeId: string | null,
    direction: string | null,
    vehicleClass: VehicleClass,
    passengerCount: number,
    luggageCount: number
  ) {
    const [rule, classConfig] = await Promise.all([
      tx.pricingRule.findFirst({
        where: {
          ...(routeId ? { routeId } : { direction: direction as never }),
          bookingType: 'PRIVATE_CAR',
          vehicleClass,
          isActive: true,
          ...(routeId ? { route: { isActive: true } } : {})
        }
      }),
      tx.vehicleClassConfig.findUnique({ where: { vehicleClass } })
    ]);

    if (!rule) {
      throw new NotFoundException('لا توجد قاعدة سعر فعالة للفئة المختارة على هذا المسار.');
    }

    const passengerCapacity =
      classConfig?.passengerCapacity ?? defaultVehicleClassCapacity(vehicleClass);
    const luggageCapacity =
      classConfig?.luggageCapacity ?? defaultVehicleClassLuggageCapacity(vehicleClass);

    if (passengerCount > passengerCapacity) {
      throw new BadRequestException(
        `سعة الفئة المختارة هي ${passengerCapacity} أشخاص. اختر فئة أكبر.`
      );
    }
    if (luggageCount > luggageCapacity) {
      throw new BadRequestException(
        `سعة الفئة المختارة هي ${luggageCapacity} حقائب. اختر فئة أكبر.`
      );
    }

    return {
      pricingRuleId: rule.id,
      passengerPrice: Number(rule.passengerPrice),
      driverFee: Number(rule.driverFee),
      platformMargin: Number(rule.platformMargin),
      currency: rule.currency
    };
  }

  private async assertDriverAvailableOnDate(
    tx: Prisma.TransactionClient,
    driverId: string,
    tripId: string,
    travelDate: Date
  ) {
    const { start: gte, end: lt } = utcDayBounds(travelDate);
    const [otherTrip, serviceRun] = await Promise.all([
      tx.trip.findFirst({
        where: {
          id: { not: tripId },
          driverId,
          travelDate: { gte, lt },
          status: {
            in: [
              'PENDING_DISPATCH',
              'SEARCHING_DRIVER',
              'DRIVER_ASSIGNED',
              'DRIVER_ARRIVING',
              'DRIVER_ARRIVED',
              'IN_PROGRESS'
            ]
          }
        },
        select: { bookingReference: true }
      }),
      tx.serviceRun.findFirst({
        where: {
          driverId,
          travelDate: { gte, lt },
          status: { not: 'CANCELLED' }
        },
        select: { runReference: true }
      })
    ]);

    if (otherTrip || serviceRun) {
      const reference = otherTrip?.bookingReference ?? serviceRun?.runReference;
      throw new ConflictException(
        reference
          ? `السائق المعيّن لديه مهمة أخرى في التاريخ الجديد (${reference}). أعد تعيين السائق قبل الحفظ.`
          : 'السائق المعيّن لديه مهمة أخرى في التاريخ الجديد. أعد تعيين السائق قبل الحفظ.'
      );
    }
  }

  private normalizedOptional(
    value: string | null | undefined,
    fallback: string | null
  ) {
    if (value === undefined) return fallback;
    return value?.trim() || null;
  }

  private changedFields(
    previous: {
      travelDate: Date | null;
      flightArrivalTime: string | null;
      flightNumber: string | null;
      vehicleClass: VehicleClass;
      passengerCount: number;
      luggageCount: number;
      pickupAddress: string;
      pickupLatitude: number;
      pickupLongitude: number;
      dropoffAddress: string;
      dropoffLatitude: number;
      dropoffLongitude: number;
      contactName: string | null;
      contactPhone: string | null;
      notes: string | null;
      pricingRuleId: string | null;
      estimatedFare: Prisma.Decimal;
      driverFee: Prisma.Decimal;
      platformMargin: Prisma.Decimal;
      currency: string;
    },
    next: Prisma.TripUncheckedUpdateInput
  ) {
    const checks: Array<[string, unknown, unknown]> = [
      ['travelDate', previous.travelDate?.getTime() ?? null, (next.travelDate as Date).getTime()],
      ['flightArrivalTime', previous.flightArrivalTime, next.flightArrivalTime],
      ['flightNumber', previous.flightNumber, next.flightNumber],
      ['vehicleClass', previous.vehicleClass, next.vehicleClass],
      ['passengerCount', previous.passengerCount, next.passengerCount],
      ['luggageCount', previous.luggageCount, next.luggageCount],
      ['pickupAddress', previous.pickupAddress, next.pickupAddress],
      ['pickupLatitude', previous.pickupLatitude, next.pickupLatitude],
      ['pickupLongitude', previous.pickupLongitude, next.pickupLongitude],
      ['dropoffAddress', previous.dropoffAddress, next.dropoffAddress],
      ['dropoffLatitude', previous.dropoffLatitude, next.dropoffLatitude],
      ['dropoffLongitude', previous.dropoffLongitude, next.dropoffLongitude],
      ['contactName', previous.contactName, next.contactName],
      ['contactPhone', previous.contactPhone, next.contactPhone],
      ['notes', previous.notes, next.notes],
      ['pricingRuleId', previous.pricingRuleId, next.pricingRuleId],
      ['estimatedFare', Number(previous.estimatedFare), Number(next.estimatedFare)],
      ['driverFee', Number(previous.driverFee), Number(next.driverFee)],
      ['platformMargin', Number(previous.platformMargin), Number(next.platformMargin)],
      ['currency', previous.currency, next.currency]
    ];
    return checks.filter(([, before, after]) => before !== after).map(([name]) => name);
  }

  private auditSnapshot(trip: {
    travelDate: Date | null;
    flightArrivalTime: string | null;
    flightNumber: string | null;
    vehicleClass: VehicleClass;
    passengerCount: number;
    luggageCount: number;
    pickupAddress: string;
    pickupLatitude: number;
    pickupLongitude: number;
    dropoffAddress: string;
    dropoffLatitude: number;
    dropoffLongitude: number;
    contactName: string | null;
    contactPhone: string | null;
    notes: string | null;
    pricingRuleId: string | null;
    estimatedFare: Prisma.Decimal;
    driverFee: Prisma.Decimal;
    platformMargin: Prisma.Decimal;
    currency: string;
  }) {
    return {
      travelDate: trip.travelDate?.toISOString() ?? null,
      flightArrivalTime: trip.flightArrivalTime,
      flightNumber: trip.flightNumber,
      vehicleClass: trip.vehicleClass,
      passengerCount: trip.passengerCount,
      luggageCount: trip.luggageCount,
      pickupAddress: trip.pickupAddress,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      dropoffAddress: trip.dropoffAddress,
      dropoffLatitude: trip.dropoffLatitude,
      dropoffLongitude: trip.dropoffLongitude,
      contactName: trip.contactName,
      contactPhone: trip.contactPhone,
      notes: trip.notes,
      pricingRuleId: trip.pricingRuleId,
      estimatedFare: Number(trip.estimatedFare),
      driverFee: Number(trip.driverFee),
      platformMargin: Number(trip.platformMargin),
      currency: trip.currency
    };
  }
}
