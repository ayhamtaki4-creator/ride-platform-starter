import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MapsService } from '../maps/maps.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingRoutePlanService {
  private readonly logger = new Logger(BookingRoutePlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService
  ) {}

  async syncPendingBooking(tripId: string) {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          status: true,
          bookingReviewStatus: true,
          driverAssignmentStatus: true,
          driverId: true,
          serviceRunId: true,
          pickupLatitude: true,
          pickupLongitude: true,
          dropoffLatitude: true,
          dropoffLongitude: true
        }
      });

      if (
        !trip ||
        trip.status !== 'PENDING_DISPATCH' ||
        trip.bookingReviewStatus !== 'NEW' ||
        trip.driverAssignmentStatus !== 'UNASSIGNED' ||
        trip.driverId ||
        trip.serviceRunId
      ) {
        return null;
      }

      const result = await this.maps.route(
        trip.pickupLatitude,
        trip.pickupLongitude,
        trip.dropoffLatitude,
        trip.dropoffLongitude
      );
      if (!result.route) return null;

      const geometry = JSON.stringify(result.route.geometry);
      const distanceKm = result.route.distanceKm;
      const durationMinutes = result.route.durationMinutes;
      const endpointGuard = Prisma.sql`
        ABS(current_trip."pickupLatitude" - ${trip.pickupLatitude}) < 0.0000001
        AND ABS(current_trip."pickupLongitude" - ${trip.pickupLongitude}) < 0.0000001
        AND ABS(current_trip."dropoffLatitude" - ${trip.dropoffLatitude}) < 0.0000001
        AND ABS(current_trip."dropoffLongitude" - ${trip.dropoffLongitude}) < 0.0000001
      `;

      const persisted = await this.prisma.$transaction(async (tx) => {
        const updatedPlans = await tx.$executeRaw(Prisma.sql`
          UPDATE "TripRoutePlan" plan
          SET "geometry" = ${geometry}::jsonb,
              "waypoints" = '[]'::jsonb,
              "distanceKm" = ${distanceKm},
              "durationMinutes" = ${durationMinutes},
              "version" = plan."version" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE plan."tripId" = ${trip.id}::uuid
            AND plan."lockedAt" IS NULL
            AND EXISTS (
              SELECT 1
              FROM "Trip" current_trip
              WHERE current_trip."id" = plan."tripId"
                AND current_trip."status"::text = 'PENDING_DISPATCH'
                AND current_trip."bookingReviewStatus"::text = 'NEW'
                AND current_trip."driverAssignmentStatus"::text = 'UNASSIGNED'
                AND current_trip."driverId" IS NULL
                AND current_trip."serviceRunId" IS NULL
                AND ${endpointGuard}
            )
        `);

        if (updatedPlans === 0) return false;

        const updatedTrips = await tx.$executeRaw(Prisma.sql`
          UPDATE "Trip" current_trip
          SET "estimatedDistanceKm" = ${distanceKm},
              "estimatedDurationMinutes" = ${durationMinutes}
          WHERE current_trip."id" = ${trip.id}::uuid
            AND current_trip."status"::text = 'PENDING_DISPATCH'
            AND current_trip."bookingReviewStatus"::text = 'NEW'
            AND current_trip."driverAssignmentStatus"::text = 'UNASSIGNED'
            AND current_trip."driverId" IS NULL
            AND current_trip."serviceRunId" IS NULL
            AND ${endpointGuard}
        `);

        if (updatedTrips === 0) {
          throw new Error('Booking endpoints changed before route enrichment completed');
        }
        return true;
      });

      if (!persisted) return null;

      return {
        provider: result.provider,
        distanceKm,
        durationMinutes
      };
    } catch (error) {
      // Route enrichment must never make a valid booking fail. The database trigger
      // already provides a safe straight-line route plan until enrichment succeeds.
      this.logger.warn(
        `Managed route enrichment skipped for trip ${tripId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}
