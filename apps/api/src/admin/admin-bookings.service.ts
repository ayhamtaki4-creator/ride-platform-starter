import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { BookingReviewStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AdminBookingAttentionFilter, AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';

const TERMINAL_TRIP_STATUSES = [
  'COMPLETED',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'NO_DRIVER_AVAILABLE',
  'PASSENGER_NO_SHOW',
  'DRIVER_NO_SHOW'
] as const;

const REVIEW_DELAY_MINUTES = 30;
const DRIVER_ASSIGNMENT_DELAY_MINUTES = 30;

function attentionWhere(attention: AdminBookingAttentionFilter, now: Date): Prisma.TripWhereInput {
  const reviewCutoff = new Date(now.getTime() - REVIEW_DELAY_MINUTES * 60_000);
  const driverCutoff = new Date(now.getTime() - DRIVER_ASSIGNMENT_DELAY_MINUTES * 60_000);
  switch (attention) {
    case 'REVIEW_OVER_30M':
    case 'REVIEW_OVER_24H':
      return {
        bookingReviewStatus: 'NEW',
        status: { notIn: [...TERMINAL_TRIP_STATUSES] },
        requestedAt: {
          lt: attention === 'REVIEW_OVER_24H' ? new Date(now.getTime() - 24 * 60 * 60_000) : reviewCutoff
        }
      };
    case 'DRIVER_UNASSIGNED':
      return {
        bookingReviewStatus: 'CONFIRMED',
        status: { in: ['PENDING_DISPATCH', 'SEARCHING_DRIVER'] },
        driverId: null
      };
    case 'DRIVER_OVER_30M':
      return {
        bookingReviewStatus: 'CONFIRMED',
        status: { in: ['PENDING_DISPATCH', 'SEARCHING_DRIVER'] },
        driverId: null,
        OR: [
          { confirmedAt: { lt: driverCutoff } },
          { confirmedAt: null, requestedAt: { lt: driverCutoff } }
        ]
      };
  }
}

type FinanceSummaryRow = {
  bookedValue: Prisma.Decimal;
  collectedValue: Prisma.Decimal;
  unpaidCompleted: bigint;
};

const bookingInclude = {
  route: {
    include: {
      origin: true,
      destination: true,
      requiredRegions: { include: { region: true } }
    }
  },
  passenger: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true }
  },
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      driverProfile: {
        select: {
          rating: true,
          avatarUrl: true,
          baseRegion: true,
          vehicles: {
            where: { isActive: true },
            take: 1,
            select: {
              make: true,
              model: true,
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
  pricingRule: true,
  serviceRun: {
    include: {
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
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } }
} satisfies Prisma.TripInclude;

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async dashboard() {
    const [
      totalBookings,
      newBookings,
      staleNewBookings,
      pendingReviewOver30Minutes,
      confirmedWithoutDriver,
      confirmedWithoutDriverOver30Minutes,
      exhaustedTelegramDeliveries,
      delayedTelegramDeliveries,
      activeTrips,
      availableDrivers,
      financeRows,
      latest
    ] = await Promise.all([
      this.prisma.trip.count({ where: { bookingReference: { not: null } } }),
      this.prisma.trip.count({
        where: {
          bookingReference: { not: null },
          bookingReviewStatus: 'NEW',
          status: { notIn: [...TERMINAL_TRIP_STATUSES] }
        }
      }),
      // Warn operators about new requests still awaiting review after 24 hours.
      // Terminal trips are excluded so historical test records cannot
      // generate perpetual alerts.
      this.prisma.trip.count({
        where: {
          bookingReference: { not: null },
          bookingReviewStatus: 'NEW',
          status: { notIn: [...TERMINAL_TRIP_STATUSES] },
          requestedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      // Review delays matter much earlier than 24 hours for airport transfers.
      this.prisma.trip.count({
        where: {
          bookingReference: { not: null },
          ...attentionWhere('REVIEW_OVER_30M', new Date())
        }
      }),
      // Confirmed but still unassigned trips need dispatch attention.
      this.prisma.trip.count({
        where: {
          bookingReference: { not: null },
          bookingReviewStatus: 'CONFIRMED',
          status: { in: ['PENDING_DISPATCH', 'SEARCHING_DRIVER'] },
          driverId: null
        }
      }),
      // Dispatches delayed 30 minutes after confirmation (or request for legacy records).
      this.prisma.trip.count({
        where: {
          bookingReference: { not: null },
          ...attentionWhere('DRIVER_OVER_30M', new Date())
        }
      }),
      // Telegram alerts exhausted their five automatic delivery attempts.
      this.prisma.telegramDelivery.count({
        where: { status: 'FAILED', attempts: { gte: 5 } }
      }),
      // Messages stuck before/during dispatch for at least 15 minutes.
      // Never expose message contents or passenger contact data in the summary.
      this.prisma.telegramDelivery.count({
        where: {
          OR: [
            { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
            { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } }
          ]
        }
      }),
      this.prisma.trip.count({
        where: {
          bookingReference: { not: null },
          status: { in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS'] }
        }
      }),
      this.prisma.driverProfile.count({
        where: { status: 'APPROVED', availability: 'ONLINE', user: { status: 'ACTIVE' } }
      }),
      this.prisma.$queryRaw<FinanceSummaryRow[]>`
        SELECT
          COALESCE(SUM(COALESCE("finalFare", "estimatedFare")), 0) AS "bookedValue",
          COALESCE(SUM("amountPaid"), 0) AS "collectedValue",
          COUNT(*) FILTER (WHERE "paymentStatus" <> 'PAID') AS "unpaidCompleted"
        FROM "Trip"
        WHERE "bookingReference" IS NOT NULL
          AND "status" = 'COMPLETED'
      `,
      this.prisma.trip.findMany({
        where: { bookingReference: { not: null } },
        orderBy: { requestedAt: 'desc' },
        take: 6,
        include: bookingInclude
      })
    ]);

    const finance = financeRows[0];
    const completedBookingValue = Number(finance?.bookedValue ?? 0);
    const revenue = Number(finance?.collectedValue ?? 0);

    return {
      totalBookings,
      newBookings,
      staleNewBookings,
      pendingReviewOver30Minutes,
      confirmedWithoutDriver,
      confirmedWithoutDriverOver30Minutes,
      exhaustedTelegramDeliveries,
      delayedTelegramDeliveries,
      activeTrips,
      availableDrivers,
      revenue,
      completedBookingValue,
      outstandingRevenue: Math.max(0, completedBookingValue - revenue),
      unpaidCompletedBookings: Number(finance?.unpaidCompleted ?? 0),
      latest: latest.map((item) => this.sanitize(item))
    };
  }

  async detail(id: string) {
    const booking = await this.prisma.trip.findFirst({
      where: {
        id,
        bookingReference: { not: null }
      },
      include: bookingInclude
    });

    if (!booking) {
      throw new NotFoundException('الحجز غير موجود.');
    }

    return this.sanitize(booking);
  }

  async list(query: AdminBookingsQueryDto) {
    const search = query.search?.trim();
    const history = query.history === 'true';
    // Explicit attention queues override status/history to match dashboard counts.
    // Always filter in Postgres before the 300-item cap so old urgent bookings
    // do not disappear behind newer non-actionable records.
    const urgent = query.attention ? attentionWhere(query.attention, new Date()) : null;
    const where: Prisma.TripWhereInput = {
      bookingReference: { not: null },
      ...(!urgent ? {
        status: history
          ? { in: [...TERMINAL_TRIP_STATUSES] }
          : { notIn: [...TERMINAL_TRIP_STATUSES] },
        ...(query.status ? { bookingReviewStatus: query.status } : {})
      } : urgent),
      ...(search
        ? {
            OR: [
              { bookingReference: { contains: search, mode: 'insensitive' } },
              { contactName: { contains: search, mode: 'insensitive' } },
              { contactPhone: { contains: search, mode: 'insensitive' } },
              { flightNumber: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const bookings = await this.prisma.trip.findMany({
      where,
      orderBy: urgent
        ? [{ requestedAt: 'asc' }]
        : [{ requestedAt: 'desc' }],
      take: 300,
      include: bookingInclude
    });

    return bookings.map((booking) => this.sanitize(booking));
  }

  async confirm(actor: AuthUser, id: string) {
    return this.changeReviewStatus(actor, id, 'CONFIRMED');
  }

  async reject(actor: AuthUser, id: string, note?: string) {
    return this.changeReviewStatus(actor, id, 'REJECTED', note);
  }

  private async changeReviewStatus(
    actor: AuthUser,
    id: string,
    to: Extract<BookingReviewStatus, 'CONFIRMED' | 'REJECTED'>,
    note?: string
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.trip.findUnique({ where: { id } });
      if (!booking || !booking.bookingReference) {
        throw new NotFoundException('الحجز غير موجود.');
      }
      if (booking.bookingReviewStatus !== 'NEW') {
        throw new ConflictException('تمت مراجعة هذا الحجز مسبقًا.');
      }

      const result = await tx.trip.updateMany({
        where: { id, bookingReviewStatus: 'NEW' },
        data:
          to === 'CONFIRMED'
            ? { bookingReviewStatus: to, confirmedAt: new Date() }
            : {
                bookingReviewStatus: to,
                rejectedAt: new Date(),
                cancelledAt: new Date(),
                status: 'NO_DRIVER_AVAILABLE'
              }
      });

      if (result.count !== 1) {
        throw new ConflictException('تغير الحجز. أعد تحميل الصفحة.');
      }

      if (to === 'REJECTED') {
        await tx.tripStatusHistory.create({
          data: {
            tripId: id,
            from: booking.status,
            to: 'NO_DRIVER_AVAILABLE',
            actorId: actor.sub,
            note: note?.trim() || 'Booking rejected by administration'
          }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: `booking.review.${to.toLowerCase()}`,
          entityType: 'Trip',
          entityId: id,
          metadata: {
            bookingReference: booking.bookingReference,
            from: booking.bookingReviewStatus,
            to,
            note: note?.trim() || null
          }
        }
      });

      return tx.trip.findUniqueOrThrow({ where: { id }, include: bookingInclude });
    });

    this.realtime.bookingUpdated({
      tripId: updated.id,
      passengerId: updated.passengerId,
      driverId: updated.driverId,
      status: updated.status,
      bookingStatus: updated.bookingReviewStatus,
      bookingReference: updated.bookingReference,
      occurredAt: new Date().toISOString(),
      reason: note?.trim() || null
    });

    return this.sanitize(updated);
  }

  private sanitize<T extends { startPinHash: string | null }>(booking: T): Omit<T, 'startPinHash'> {
    const { startPinHash: _hidden, ...safe } = booking;
    return safe;
  }
}
