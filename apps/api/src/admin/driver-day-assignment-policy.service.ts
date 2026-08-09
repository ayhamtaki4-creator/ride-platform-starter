import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { utcDayBounds } from '../common/service-date';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriverDayAssignmentPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAssign(tripId: string, driverId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        routeId: true,
        direction: true,
        bookingType: true,
        travelDate: true,
        serviceRunId: true
      }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    if (trip.bookingType !== 'PRIVATE_CAR' || !trip.travelDate) return;

    const { start, end } = utcDayBounds(trip.travelDate);

    const [runs, requestedRoute] = await Promise.all([
      this.prisma.serviceRun.findMany({
        where: {
          driverId,
          travelDate: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          ...(trip.serviceRunId ? { id: { not: trip.serviceRunId } } : {})
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          runReference: true,
          direction: true,
          route: { select: { originId: true, destinationId: true } }
        }
      }),
      trip.routeId
        ? this.prisma.serviceRoute.findUnique({
            where: { id: trip.routeId },
            select: { originId: true, destinationId: true }
          })
        : Promise.resolve(null)
    ]);

    if (runs.length === 0) return;
    if (runs.length >= 2) {
      throw new ConflictException('لدى السائق بالفعل رحلتا ذهاب وإياب في هذا اليوم.');
    }

    const existing = runs[0];
    const reverseDynamicRoute = Boolean(
      requestedRoute &&
      existing.route &&
      existing.route.originId === requestedRoute.destinationId &&
      existing.route.destinationId === requestedRoute.originId
    );
    const reverseLegacyDirection = Boolean(
      !trip.routeId && this.areLegacyDirectionsOpposite(existing.direction, trip.direction)
    );

    if (!reverseDynamicRoute && !reverseLegacyDirection) {
      throw new ConflictException(
        `لدى السائق رحلة في الاتجاه نفسه أو مسار غير معاكس في هذا اليوم (${existing.runReference}).`
      );
    }
  }

  private areLegacyDirectionsOpposite(first: string | null, second: string | null) {
    return (
      (first === 'BEIRUT_AIRPORT_TO_DAMASCUS' && second === 'DAMASCUS_TO_BEIRUT_AIRPORT') ||
      (first === 'DAMASCUS_TO_BEIRUT_AIRPORT' && second === 'BEIRUT_AIRPORT_TO_DAMASCUS')
    );
  }
}
