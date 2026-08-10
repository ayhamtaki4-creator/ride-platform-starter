import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverReviewDto } from './dto/create-driver-review.dto';

@Injectable()
export class DriverReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForBooking(
    user: AuthUser,
    tripId: string,
    dto: CreateDriverReviewDto
  ) {
    const comment = dto.comment?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await tx.trip.findUnique({
          where: { id: tripId },
          select: {
            id: true,
            passengerId: true,
            driverId: true,
            status: true,
            bookingReference: true
          }
        });

        if (!trip || trip.passengerId !== user.sub) {
          throw new NotFoundException('الحجز غير موجود.');
        }
        if (trip.status !== 'COMPLETED') {
          throw new ConflictException('يمكن تقييم السائق بعد اكتمال الرحلة فقط.');
        }
        if (!trip.driverId) {
          throw new ConflictException('لا يوجد سائق مرتبط بهذه الرحلة.');
        }

        const lockedProfiles = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM "DriverProfile"
          WHERE "userId" = ${trip.driverId}::uuid
          FOR UPDATE
        `);
        if (lockedProfiles.length === 0) {
          throw new NotFoundException('ملف السائق غير موجود.');
        }

        const existing = await tx.driverReview.findUnique({
          where: { tripId: trip.id },
          select: { id: true }
        });
        if (existing) {
          throw new ConflictException('تم تقييم هذه الرحلة مسبقًا.');
        }

        const review = await tx.driverReview.create({
          data: {
            tripId: trip.id,
            passengerId: user.sub,
            driverId: trip.driverId,
            rating: dto.rating,
            comment
          }
        });

        const aggregate = await tx.driverReview.aggregate({
          where: { driverId: trip.driverId },
          _avg: { rating: true },
          _count: true
        });
        const driverRating = Number((aggregate._avg.rating ?? 5).toFixed(2));
        const reviewCount = aggregate._count;

        await tx.driverProfile.update({
          where: { userId: trip.driverId },
          data: { rating: driverRating }
        });

        await tx.auditLog.create({
          data: {
            actorId: user.sub,
            action: 'driver.review.create',
            entityType: 'DriverReview',
            entityId: review.id,
            metadata: {
              tripId: trip.id,
              bookingReference: trip.bookingReference,
              driverId: trip.driverId,
              rating: dto.rating,
              hasComment: Boolean(comment)
            }
          }
        });

        await tx.notification.create({
          data: {
            userId: trip.driverId,
            type: 'DRIVER_REVIEW_RECEIVED',
            title: 'تقييم جديد من أحد المسافرين',
            message: `حصلت على تقييم ${dto.rating} من 5 بعد رحلة مكتملة.`,
            entityType: 'DriverReview',
            entityId: review.id,
            link: '/driver/profile',
            dedupeKey: `driver-review:${review.id}`,
            metadata: {
              tripId: trip.id,
              bookingReference: trip.bookingReference,
              rating: dto.rating
            }
          }
        });

        return {
          ...review,
          driverRating,
          reviewCount
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('تم تقييم هذه الرحلة مسبقًا.');
      }
      throw error;
    }
  }

  async listForDriver(user: AuthUser, limitValue?: string) {
    const parsedLimit = Number.parseInt(limitValue ?? '20', 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(50, Math.max(1, parsedLimit))
      : 20;

    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub },
      select: { rating: true }
    });
    if (!profile) {
      throw new NotFoundException('ملف السائق غير موجود.');
    }

    const [reviews, reviewCount] = await Promise.all([
      this.prisma.driverReview.findMany({
        where: { driverId: user.sub },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      this.prisma.driverReview.count({ where: { driverId: user.sub } })
    ]);

    const tripIds = reviews.map((review) => review.tripId);
    const trips = tripIds.length
      ? await this.prisma.trip.findMany({
          where: { id: { in: tripIds } },
          select: { id: true, bookingReference: true, completedAt: true }
        })
      : [];
    const tripMap = new Map(trips.map((trip) => [trip.id, trip]));

    return {
      rating: profile.rating,
      reviewCount,
      reviews: reviews.map((review) => ({
        id: review.id,
        tripId: review.tripId,
        bookingReference: tripMap.get(review.tripId)?.bookingReference ?? null,
        completedAt: tripMap.get(review.tripId)?.completedAt ?? null,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt
      }))
    };
  }
}
