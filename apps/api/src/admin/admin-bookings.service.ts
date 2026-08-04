import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { BookingReviewStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';

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

  statusHistory: { orderBy: { createdAt: 'asc' as const } }
} satisfies Prisma.TripInclude;

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async dashboard() {
    const [totalBookings, newBookings, activeTrips, availableDrivers, revenue, latest] =
      await Promise.all([
        this.prisma.trip.count({ where: { bookingReference: { not: null } } }),
        this.prisma.trip.count({
          where: { bookingReference: { not: null }, bookingReviewStatus: 'NEW' }
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
        this.prisma.trip.aggregate({
          where: { bookingReference: { not: null }, status: 'COMPLETED' },
          _sum: { finalFare: true, estimatedFare: true }
        }),
        this.prisma.trip.findMany({
          where: { bookingReference: { not: null } },
          orderBy: { requestedAt: 'desc' },
          take: 6,
          include: bookingInclude
        })
      ]);

    return {
      totalBookings,
      newBookings,
      activeTrips,
      availableDrivers,
      revenue: Number(revenue._sum.finalFare ?? revenue._sum.estimatedFare ?? 0),
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
    const where: Prisma.TripWhereInput = {
      bookingReference: { not: null },
      ...(query.status ? { bookingReviewStatus: query.status } : {}),
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
      orderBy: [{ travelDate: 'asc' }, { requestedAt: 'desc' }],
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
async update(user: any, id: string, dto: any) {
  return this.prisma.trip.update({
    where: { id },
    data: dto,
  });
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
