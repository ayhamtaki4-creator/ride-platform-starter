import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { BookingDirection, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { normalizeInternationalPhone } from '../common/phone';
import { isPastServiceDate, parseDateOnly } from '../common/service-date';
import { AuthUser } from '../iam/auth-user.type';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadedMediaFile } from '../media/media.service';
import { FlightTicketsService } from './flight-tickets.service';
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
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
    private readonly media: MediaService,
    private readonly telegram: TelegramService,
    private readonly flightTickets: FlightTicketsService,
    private readonly config: ConfigService
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

  /**
   * A guest request never claims an existing user's account based on their phone.
   * Newly-created accounts remain suspended pending out-of-band phone verification.
   */
  async createGuest(dto: CreateBookingDto, ticketFile?: UploadedMediaFile) {
    if (!dto.clientRequestId) {
      throw new BadRequestException('معرف طلب الحجز مطلوب لمنع التكرار.');
    }
    const phone = normalizeInternationalPhone(dto.passengerPhone);
    const request = { ...dto, passengerPhone: phone };

    // Idempotency must be checked before creating a provisional account.
    if (dto.clientRequestId) {
      const prior = await this.prisma.trip.findUnique({
        where: { clientRequestId: dto.clientRequestId },
        select: { id: true, contactPhone: true, bookingReference: true, bookingSource: true }
      });
      if (prior) {
        if (prior.bookingSource !== 'GUEST' || prior.contactPhone !== phone) {
          throw new BadRequestException('معرف طلب الحجز مستخدم بالفعل.');
        }
        let attachmentSaved: boolean | undefined;
        if (ticketFile) {
          try {
            attachmentSaved = await this.saveGuestTicket(prior.id, dto.routeId, ticketFile);
          } catch {
            attachmentSaved = false;
          }
        }
        await this.telegram.enqueueBookingCreated(prior.id);
        return { bookingId: prior.id, bookingReference: prior.bookingReference, accepted: true, attachmentSaved };
      }
    }

    // Validate the date and price before provisioning an account.
    const date = parseDateOnly(dto.travelDate);
    if (!date || isPastServiceDate(date)) {
      throw new BadRequestException('يجب اختيار تاريخ رحلة صالح وغير ماضٍ.');
    }
    await this.resolveQuote({
      routeId: dto.routeId,
      direction: dto.direction,
      bookingType: dto.bookingType,
      vehicleClass: dto.vehicleClass,
      passengerCount: dto.passengerCount,
      luggageCount: dto.luggageCount
    });
    if (dto.flightTicketMediaId) {
      throw new BadRequestException('إرفاق التذكرة يتطلب حسابًا. يمكنك تعبئة بيانات الرحلة يدويًا.');
    }
    if (dto.routeId) {
      const route = await this.prisma.serviceRoute.findUnique({
        where: { id: dto.routeId },
        select: { requiresFlightDetails: true }
      });
      if (route?.requiresFlightDetails && (!dto.flightArrivalTime?.trim() || !dto.flightNumber?.trim())) {
        throw new BadRequestException('يجب إدخال وقت الرحلة الجوية ورقمها قبل إرسال الحجز.');
      }
    }

    if (ticketFile) {
      if (dto.routeId) {
        const route = await this.prisma.serviceRoute.findUnique({
          where: { id: dto.routeId },
          select: { flightTicketUploadEnabled: true, requiresFlightDetails: true }
        });
        if (!route?.requiresFlightDetails || !route.flightTicketUploadEnabled) {
          throw new BadRequestException('إرفاق التذكرة غير متاح لهذا المسار.');
        }
      }
      // Validate the file before creating the provisional account or reservation.
      await this.flightTickets.analyze(ticketFile, dto.routeId);
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true }
    });
    let accountId: string | null = null;
    let provisionalAccountCreated = false;
    // Without OTP, avoid reserving new phone numbers in suspended accounts.
    // Customers can then create a normal account whenever they choose.
    // Enable this only when verified phone activation is operational.
    if (!existing && this.config.get<string>('GUEST_PROVISIONAL_ACCOUNT_ENABLED') === 'true') {
      const passengerRole = await this.prisma.role.findUniqueOrThrow({
        where: { code: 'PASSENGER' }
      });
      const parts = dto.passengerName.trim().split(/\s+/);
      const firstName = parts.shift() ?? 'مسافر';
      const lastName = parts.join(' ') || 'طريق الشام';
      const disabledPassword = randomBytes(32).toString('hex');
      try {
        const newAccount = await this.prisma.user.create({
          data: {
            // Keep legacy email-based accounts compatible until optional email is migrated.
            email: `guest-${randomUUID()}@accounts.tareeqalsham.invalid`,
            phone,
            firstName,
            lastName,
            passwordHash: await bcrypt.hash(disabledPassword, 12),
            provisionalAccount: true,
            status: 'SUSPENDED',
            whatsappOptIn: false,
            passengerProfile: { create: {} },
            roles: { create: { roleId: passengerRole.id } }
          },
          select: { id: true }
        });
        accountId = newAccount.id;
        provisionalAccountCreated = true;
      } catch (error) {
        // Concurrent requests for the same phone must not overwrite its account.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
      }
    }

    const actor: AuthUser | null = accountId
      ? { sub: accountId, email: '', roles: ['PASSENGER'], permissions: [] }
      : null;
    let booking: Awaited<ReturnType<BookingsService['create']>>;
    try {
      booking = await this.create(actor, request, {
        guest: true,
        newAccountCreated: provisionalAccountCreated,
        delayTelegram: true
      });
    } catch (error) {
      if (accountId) {
        // Remove an unused, never-verified placeholder if booking validation failed.
        await this.prisma.user.deleteMany({
          where: { id: accountId, provisionalAccount: true, passengerTrips: { none: {} } }
        }).catch(() => undefined);
      }
      throw error;
    }
    let attachmentSaved: boolean | undefined;
    if (ticketFile) {
      try {
        attachmentSaved = await this.saveGuestTicket(booking.id, dto.routeId, ticketFile);
      } catch (error) {
        attachmentSaved = false;
        this.logger.warn(`Guest booking ${booking.id} created, but the ticket could not be attached: ${error instanceof Error ? error.message : 'upload failed'}`);
      }
    }
    await this.telegram.enqueueBookingCreated(booking.id, provisionalAccountCreated);
    return { bookingId: booking.id, bookingReference: booking.bookingReference, accepted: true, attachmentSaved };
  }

  private async saveGuestTicket(
    bookingId: string,
    routeId: string | undefined,
    file: UploadedMediaFile
  ) {
    const existingTicket = await this.prisma.trip.findUnique({
      where: { id: bookingId },
      select: { flightTicketMediaId: true, bookingSource: true }
    });
    if (!existingTicket || existingTicket.bookingSource !== 'GUEST') {
      throw new BadRequestException('الحجز غير صالح لإرفاق التذكرة.');
    }
    if (existingTicket.flightTicketMediaId) return true;

    const accountEmail = 'guest-ticket-storage@internal.tareeqalsham.invalid';
    const storageAccount = await this.prisma.user.upsert({
      where: { email: accountEmail },
      update: {},
      create: {
        email: accountEmail,
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
        firstName: 'Guest',
        lastName: 'Media',
        status: 'SUSPENDED'
      },
      select: { id: true, email: true }
    });
    const systemActor: AuthUser = {
      sub: storageAccount.id,
      email: storageAccount.email,
      roles: [],
      permissions: []
    };
    const result = await this.flightTickets.uploadAndExtract(systemActor, file, routeId);
    await this.prisma.trip.updateMany({
      where: { id: bookingId, bookingSource: 'GUEST', flightTicketMediaId: null },
      data: {
        flightTicketMediaId: result.asset.id,
        flightTicketData: result.extraction as unknown as Prisma.InputJsonValue
      }
    });
    return true;
  }

  async create(
    user: AuthUser | null,
    dto: CreateBookingDto,
    options?: { guest?: boolean; newAccountCreated?: boolean; delayTelegram?: boolean }
  ) {
    const travelDate = parseDateOnly(dto.travelDate);

    if (!travelDate || isPastServiceDate(travelDate)) {
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
            uploadedById: user?.sub ?? '',
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
    const normalizedBookingData = {
      pricingRuleId: quote.pricingRuleId,
      routeId: quote.routeId,
      direction: quote.direction,
      bookingType: dto.bookingType,
      vehicleClass: quote.vehicleClass,
      travelDate,
      flightArrivalTime: dto.flightArrivalTime?.trim() || null,
      flightNumber: dto.flightNumber?.trim() || null,
      ...(flightTicket?.id ? { flightTicketMediaId: flightTicket.id } : {}),
      ...(flightTicket?.metadata !== undefined && flightTicket?.metadata !== null
        ? { flightTicketData: flightTicket.metadata }
        : {}),
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
      currency: quote.currency
    };

    const refreshPendingIdempotentBooking = async (existing: BookingWithRelations) => {
      const canRefresh =
        existing.status === 'PENDING_DISPATCH' &&
        existing.bookingReviewStatus === 'NEW' &&
        existing.driverAssignmentStatus === 'UNASSIGNED' &&
        !existing.driverId &&
        !existing.serviceRunId;

      if (!canRefresh) {
        await this.telegram.enqueueBookingCreated(existing.id);
        return existing;
      }

      const refreshed = await this.prisma.trip.update({
        where: { id: existing.id },
        data: normalizedBookingData,
        include: bookingInclude
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: user?.sub ?? null,
          action: 'booking.idempotent_refresh',
          entityType: 'Trip',
          entityId: refreshed.id,
          metadata: {
            clientRequestId: dto.clientRequestId,
            routeId: quote.routeId,
            customPickup: dto.pickupLatitude !== undefined,
            customDropoff: dto.dropoffLatitude !== undefined,
            pickupAddress,
            dropoffAddress
          }
        }
      });

      await this.telegram.enqueueBookingCreated(refreshed.id);
      this.realtime.bookingUpdated({
        tripId: refreshed.id,
        passengerId: refreshed.passengerId,
        driverId: refreshed.driverId,
        status: refreshed.status,
        bookingStatus: refreshed.bookingReviewStatus,
        bookingReference: refreshed.bookingReference,
        occurredAt: new Date().toISOString()
      });
      return refreshed;
    };

    if (dto.clientRequestId) {
      const existing = await this.prisma.trip.findFirst({
        where: {
          clientRequestId: dto.clientRequestId,
          passengerId: user?.sub ?? null
        },
        include: bookingInclude
      });
      if (existing) {
        const refreshed = await refreshPendingIdempotentBooking(existing);
        return this.serialize(refreshed);
      }
    }

    const bookingReference = await this.generateReference();

    let booking: BookingWithRelations;
    try {
      booking = await this.prisma.trip.create({
        data: {
          clientRequestId: dto.clientRequestId,
          passengerId: user?.sub ?? null,
          bookingSource: options?.guest ? 'GUEST' : 'AUTHENTICATED',
          accountLinkStatus: user ? 'LINKED' : 'UNLINKED',
          status: 'PENDING_DISPATCH',
          bookingReviewStatus: 'NEW',
          bookingReference,
          ...normalizedBookingData,
          statusHistory: {
            create: {
              to: 'PENDING_DISPATCH',
              actorId: user?.sub ?? null,
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
            passengerId: user?.sub ?? null
          },
          include: bookingInclude
        });
        if (existing) {
          const refreshed = await refreshPendingIdempotentBooking(existing);
          return this.serialize(refreshed);
        }
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub ?? null,
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

    if (!options?.delayTelegram) {
      await this.telegram.enqueueBookingCreated(booking.id, Boolean(options?.newAccountCreated));
    }

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
