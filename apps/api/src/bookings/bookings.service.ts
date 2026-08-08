import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { BookingDirection, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { AuthUser } from '../iam/auth-user.type';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  defaultVehicleClassCapacity,
  defaultVehicleClassLuggageCapacity
} from '../pricing/vehicle-class';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { TelegramService } from '../telegram/telegram.service';
import { BookingQuoteDto } from './dto/booking-quote.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

const LEGACY_ROUTE_DEFAULTS: Record<BookingDirection, {
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffLatitude: number;
  dropoffLongitude: number;
  distanceKm: number;
  durationMinutes: number;
}> = {
  BEIRUT_AIRPORT_TO_DAMASCUS: {
    pickupLatitude: 33.8209,
    pickupLongitude: 35.4884,
    dropoffLatitude: 33.5138,
    dropoffLongitude: 36.2765,
    distanceKm: 115,
    durationMinutes: 150
  },
  DAMASCUS_TO_BEIRUT_AIRPORT: {
    pickupLatitude: 33.5138,
    pickupLongitude: 36.2765,
    dropoffLatitude: 33.8209,
    dropoffLongitude: 35.4884,
    distanceKm: 115,
    durationMinutes: 150
  }
};

const bookingInclude = {
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  passenger: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true }
  },
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
      phone: true,
      driverTrips: {
        where: { status: 'COMPLETED' as const },
        select: { id: true }
      },
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
                orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
                select: { url: true, isPrimary: true }
              }
            }
          }
        }
      }
    }
  },
  pricingRule: true,
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
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            select: { url: true, isPrimary: true }
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
          driverAssignmentStatus: true,
          status: true
        }
      }
    }
  },
  flightTicketMedia: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      metadata: true
    }
  }
} satisfies Prisma.TripInclude;

type BookingWithRelations = Prisma.TripGetPayload<{ include: typeof bookingInclude }>;
type RouteBookingPolicyRow = {
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
    private readonly media: MediaService,
    private readonly telegram: TelegramService
  ) {}

  async quote(dto: BookingQuoteDto) {
    const resolved = await this.resolveQuote(dto);
    const { driverFee: _driverFee, platformMargin: _platformMargin, ...publicQuote } = resolved;
    return publicQuote;
  }

  private async resolveQuote(dto: BookingQuoteDto) {
    if (Boolean(dto.routeId) === Boolean(dto.direction)) {
      throw new BadRequestException('يجب تحديد routeId أو direction، وليس كليهما.');
    }

    const vehicleClass = dto.bookingType === 'PRIVATE_CAR' ? dto.vehicleClass : 'SMALL';
    const [rule, classConfig] = await Promise.all([
      this.prisma.pricingRule.findFirst({
        where: {
          ...(dto.routeId ? { routeId: dto.routeId } : { direction: dto.direction }),
          bookingType: dto.bookingType,
          vehicleClass,
          isActive: true,
          ...(dto.routeId ? { route: { isActive: true } } : {})
        },
        include: {
          route: { include: { origin: true, destination: true } }
        }
      }),
      this.prisma.vehicleClassConfig.findUnique({ where: { vehicleClass } })
    ]);

    if (!rule) {
      throw new NotFoundException('لا توجد قاعدة سعر فعالة لهذا المسار ونوع الحجز.');
    }

    const passengerCapacity =
      classConfig?.passengerCapacity ?? defaultVehicleClassCapacity(vehicleClass);
    const luggageCapacity =
      classConfig?.luggageCapacity ?? defaultVehicleClassLuggageCapacity(vehicleClass);
    if (dto.bookingType === 'PRIVATE_CAR' && dto.passengerCount > passengerCapacity) {
      throw new BadRequestException(
        `سعة الفئة المختارة هي ${passengerCapacity} أشخاص. اختر فئة أكبر.`
      );
    }
    if (dto.bookingType === 'PRIVATE_CAR' && dto.luggageCount > luggageCapacity) {
      throw new BadRequestException(
        `سعة الفئة المختارة هي ${luggageCapacity} حقائب. اختر فئة أكبر.`
      );
    }

    const multiplier = dto.bookingType === 'SHARED_SEAT' ? dto.passengerCount : 1;
    const passengerPrice = Number(rule.passengerPrice) * multiplier;
    const driverFee = Number(rule.driverFee) * multiplier;
    const platformMargin = Number(rule.platformMargin) * multiplier;

    return {
      pricingRuleId: rule.id,
      routeId: rule.routeId,
      route: rule.route,
      direction: rule.direction,
      bookingType: dto.bookingType,
      vehicleClass,
      passengerCapacity,
      luggageCapacity,
      passengerCount: dto.passengerCount,
      luggageCount: dto.luggageCount,
      unitPassengerPrice: Number(rule.passengerPrice),
      passengerPrice,
      driverFee,
      platformMargin,
      currency: rule.currency
    };
  }

  async create(user: AuthUser, dto: CreateBookingDto) {
    if (dto.clientRequestId) {
      const existing = await this.prisma.trip.findFirst({
        where: {
          clientRequestId: dto.clientRequestId,
          passengerId: user.sub
        },
        include: bookingInclude
      });
      if (existing) {
        await this.telegram.enqueueBookingCreated(existing.id);
        return this.serialize(existing);
      }
    }

    const travelDate = new Date(dto.travelDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(travelDate.getTime()) || travelDate < today) {
      throw new BadRequestException('يجب اختيار تاريخ رحلة صالح وغير ماضٍ.');
    }

    const quote = await this.resolveQuote({
      routeId: dto.routeId,
      direction: dto.direction,
      bookingType: dto.bookingType,
      vehicleClass: dto.vehicleClass,
      passengerCount: dto.passengerCount,
      luggageCount: dto.luggageCount
    });

    const route = quote.route;
    if (
      route?.requiresFlightDetails &&
      (!dto.flightArrivalTime?.trim() || !dto.flightNumber?.trim())
    ) {
      throw new BadRequestException(
        'هذا المسار يتطلب تاريخ الوصول ووقت الوصول ورقم الرحلة الجوية.'
      );
    }

    const flightTicket = dto.flightTicketMediaId
      ? await this.prisma.mediaAsset.findFirst({
          where: {
            id: dto.flightTicketMediaId,
            uploadedById: user.sub,
            purpose: 'FLIGHT_TICKET',
            deletedAt: null
          },
          select: { id: true, metadata: true }
        })
      : null;
    if (dto.flightTicketMediaId && !flightTicket) {
      throw new BadRequestException(
        'ملف تذكرة الطيران غير موجود أو لا يخص هذا الحساب.'
      );
    }

    const legacyDefaults = dto.direction ? LEGACY_ROUTE_DEFAULTS[dto.direction] : null;
    let pickupLatitude = Number(route?.origin.latitude ?? legacyDefaults?.pickupLatitude ?? 0);
    let pickupLongitude = Number(route?.origin.longitude ?? legacyDefaults?.pickupLongitude ?? 0);
    let dropoffLatitude = Number(route?.destination.latitude ?? legacyDefaults?.dropoffLatitude ?? 0);
    let dropoffLongitude = Number(route?.destination.longitude ?? legacyDefaults?.dropoffLongitude ?? 0);
    let pickupAddress = dto.pickupAddress.trim();
    let dropoffAddress = dto.dropoffAddress.trim();

    if (route) {
      const policies = await this.prisma.$queryRaw<RouteBookingPolicyRow[]>(Prisma.sql`
        SELECT "passengerCanEditPickup", "passengerCanEditDropoff"
        FROM "RouteBookingPolicy"
        WHERE "routeId" = ${route.id}::uuid
        LIMIT 1
      `);
      const policy = policies[0] ?? {
        passengerCanEditPickup: route.origin.type !== 'AIRPORT',
        passengerCanEditDropoff: route.destination.type !== 'AIRPORT'
      };

      const pickupLatitudeProvided = dto.pickupLatitude !== undefined;
      const pickupLongitudeProvided = dto.pickupLongitude !== undefined;
      const dropoffLatitudeProvided = dto.dropoffLatitude !== undefined;
      const dropoffLongitudeProvided = dto.dropoffLongitude !== undefined;

      if (!policy.passengerCanEditPickup) {
        pickupAddress = route.origin.nameAr;
        pickupLatitude = Number(route.origin.latitude);
        pickupLongitude = Number(route.origin.longitude);
      } else {
        if (pickupLatitudeProvided !== pickupLongitudeProvided) {
          throw new BadRequestException('يجب إرسال إحداثيي نقطة الانطلاق معًا.');
        }
        if (pickupLatitudeProvided && pickupLongitudeProvided) {
          pickupLatitude = dto.pickupLatitude!;
          pickupLongitude = dto.pickupLongitude!;
        }
      }

      if (!policy.passengerCanEditDropoff) {
        dropoffAddress = route.destination.nameAr;
        dropoffLatitude = Number(route.destination.latitude);
        dropoffLongitude = Number(route.destination.longitude);
      } else {
        if (dropoffLatitudeProvided !== dropoffLongitudeProvided) {
          throw new BadRequestException('يجب إرسال إحداثيي نقطة الوصول معًا.');
        }
        if (dropoffLatitudeProvided && dropoffLongitudeProvided) {
          dropoffLatitude = dto.dropoffLatitude!;
          dropoffLongitude = dto.dropoffLongitude!;
        }
      }
    }

    this.assertCoordinate(pickupLatitude, 90, 'خط عرض نقطة الانطلاق');
    this.assertCoordinate(pickupLongitude, 180, 'خط طول نقطة الانطلاق');
    this.assertCoordinate(dropoffLatitude, 90, 'خط عرض نقطة الوصول');
    this.assertCoordinate(dropoffLongitude, 180, 'خط طول نقطة الوصول');

    const estimatedDistanceKm = Number(route?.distanceKm ?? legacyDefaults?.distanceKm ?? 0);
    const estimatedDurationMinutes = route?.estimatedMinutes ?? legacyDefaults?.durationMinutes ?? 0;
    const bookingReference = await this.generateReference();

    let booking: BookingWithRelations;
    try {
      booking = await this.prisma.trip.create({
        data: {
          clientRequestId: dto.clientRequestId,
          passengerId: user.sub,
          pricingRuleId: quote.pricingRuleId,
          routeId: quote.routeId,
          status: 'PENDING_DISPATCH',
          bookingReviewStatus: 'NEW',
          bookingReference,
          direction: quote.direction,
          bookingType: dto.bookingType,
          vehicleClass: quote.vehicleClass,
          travelDate,
          flightArrivalTime: dto.flightArrivalTime?.trim() || null,
          flightNumber: dto.flightNumber?.trim() || null,
          flightTicketMediaId: flightTicket?.id,
          flightTicketData:
            flightTicket?.metadata === null ? undefined : flightTicket?.metadata,
          passengerCount: dto.passengerCount,
          luggageCount: dto.luggageCount,
          contactName: dto.passengerName.trim(),
          contactPhone: dto.passengerPhone.trim(),
          notes: dto.notes?.trim() || null,
          pickupAddress,
          pickupLatitude,
          pickupLongitude,
          dropoffAddress,
          dropoffLatitude,
          dropoffLongitude,
          estimatedDistanceKm,
          estimatedDurationMinutes,
          estimatedFare: quote.passengerPrice,
          driverFee: quote.driverFee,
          platformMargin: quote.platformMargin,
          currency: quote.currency,
          statusHistory: {
            create: {
              to: 'PENDING_DISPATCH',
              actorId: user.sub,
              note: 'Booking submitted and awaiting administration confirmation'
            }
          }
        },
        include: bookingInclude
      });
    } catch (error) {
      if (
        dto.clientRequestId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.trip.findFirst({
          where: {
            clientRequestId: dto.clientRequestId,
            passengerId: user.sub
          },
          include: bookingInclude
        });
        if (existing) {
          await this.telegram.enqueueBookingCreated(existing.id);
          return this.serialize(existing);
        }
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'booking.create',
        entityType: 'Trip',
        entityId: booking.id,
        metadata: {
          bookingReference,
          routeId: quote.routeId,
          routeCode: quote.route?.code ?? null,
          direction: quote.direction,
          bookingType: dto.bookingType,
          vehicleClass: quote.vehicleClass,
          travelDate: dto.travelDate,
          passengerCount: dto.passengerCount,
          luggageCount: dto.luggageCount,
          customPickup: dto.pickupLatitude !== undefined,
          customDropoff: dto.dropoffLatitude !== undefined
        }
      }
    });

    await this.telegram.enqueueBookingCreated(booking.id);

    this.realtime.bookingCreated({
      tripId: booking.id,
      passengerId: booking.passengerId,
      driverId: booking.driverId,
      status: booking.status,
      bookingStatus: booking.bookingReviewStatus,
      bookingReference: booking.bookingReference,
      occurredAt: new Date().toISOString()
    });

    return this.serialize(booking);
  }

  async mine(user: AuthUser) {
    const bookings = await this.prisma.trip.findMany({
      where: {
        passengerId: user.sub,
        bookingReference: { not: null }
      },
      orderBy: [{ travelDate: 'desc' }, { requestedAt: 'desc' }],
      include: bookingInclude
    });

    return bookings.map((booking) => this.serialize(booking));
  }

  async flightTicketFile(user: AuthUser, tripId: string) {
    const booking = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { passengerId: true, flightTicketMediaId: true }
    });
    if (!booking?.flightTicketMediaId) {
      throw new NotFoundException('لا توجد تذكرة طيران مرتبطة بهذا الحجز.');
    }

    const isDispatch = user.roles.some((role) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role)
    );
    if (booking.passengerId !== user.sub && !isDispatch) {
      throw new NotFoundException('تذكرة الطيران غير موجودة.');
    }

    return this.media.authorizedFile(booking.flightTicketMediaId);
  }

  private serialize(booking: BookingWithRelations) {
    const {
      startPinHash: _hidden,
      driverFee: _driverFee,
      platformMargin: _platformMargin,
      pricingRule: _pricingRule,
      driver: rawDriver,
      serviceRun: rawServiceRun,
      ...safe
    } = booking;

    const fallbackVehicle = rawDriver?.driverProfile?.vehicles[0] ?? null;
    const vehicle = rawServiceRun?.vehicle ?? fallbackVehicle;
    const imageUrls = vehicle?.images.map((image) => image.url) ?? [];
    const primaryImageUrl =
      vehicle?.primaryImageUrl ??
      vehicle?.images.find((image) => image.isPrimary)?.url ??
      imageUrls[0] ??
      null;
    const canContactDriver = booking.driverAssignmentStatus === 'ACCEPTED';
    const publicVehicle = vehicle
      ? {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plateNumber: this.maskPlate(vehicle.plateNumber),
          maskedPlateNumber: this.maskPlate(vehicle.plateNumber),
          seatCapacity: vehicle.seatCapacity,
          baseRegion: vehicle.baseRegion,
          primaryImageUrl,
          images: imageUrls
        }
      : null;

    return {
      ...safe,
      driver: rawDriver
        ? {
            id: rawDriver.id,
            firstName: rawDriver.firstName,
            lastName: rawDriver.lastName,
            phone: canContactDriver ? rawDriver.phone : null,
            driverProfile: rawDriver.driverProfile
              ? {
                  rating: rawDriver.driverProfile.rating,
                  avatarUrl: rawDriver.driverProfile.avatarUrl,
                  baseRegion: rawDriver.driverProfile.baseRegion,
                  vehicles: publicVehicle ? [publicVehicle] : []
                }
              : null
          }
        : null,
      serviceRun: rawServiceRun
        ? {
            ...rawServiceRun,
            vehicle: publicVehicle,
            bookings: rawServiceRun.bookings.map(
              ({ contactName: _contactName, contactPhone: _contactPhone, ...item }) => item
            )
          }
        : null,
      driverPublicProfile: rawDriver
        ? {
            userId: rawDriver.id,
            displayName: `${rawDriver.firstName} ${rawDriver.lastName}`.trim(),
            phone: canContactDriver ? rawDriver.phone : null,
            avatarUrl: rawDriver.driverProfile?.avatarUrl ?? null,
            rating: rawDriver.driverProfile?.rating ?? null,
            completedTrips: rawDriver.driverTrips.length,
            baseRegion: rawDriver.driverProfile?.baseRegion ?? null,
            vehicle: publicVehicle
          }
        : null
    };
  }

  private assertCoordinate(value: number, limit: number, label: string) {
    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      throw new BadRequestException(`${label} غير صالح.`);
    }
  }

  private maskPlate(value: string) {
    const clean = value.trim();
    if (clean.length <= 4) return clean;
    return `${clean.slice(0, Math.min(3, clean.length - 3))} ••• ${clean.slice(-3)}`;
  }

  private async generateReference() {
    const year = new Date().getFullYear().toString().slice(-2);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const reference = `TS-${year}${randomInt(1000, 10000)}`;
      const exists = await this.prisma.trip.findUnique({
        where: { bookingReference: reference },
        select: { id: true }
      });
      if (!exists) return reference;
    }

    throw new BadRequestException('تعذر إنشاء رقم حجز فريد. أعد المحاولة.');
  }
}
