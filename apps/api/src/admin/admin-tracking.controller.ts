import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../iam/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

type ActiveTripTrackingRow = {
  tripId: string;
  bookingReference: string | null;
  status: string;
  driverId: string;
  driverFirstName: string;
  driverLastName: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: Date | null;
};

@ApiTags('Administration - Tracking')
@ApiBearerAuth()
@Controller('admin/tracking')
export class AdminTrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Permissions('booking:read:any')
  @Get('active-trips')
  async activeTrips() {
    const rows = await this.prisma.$queryRaw<ActiveTripTrackingRow[]>`
      SELECT
        t."id" AS "tripId",
        t."bookingReference" AS "bookingReference",
        t."status"::text AS "status",
        d."id" AS "driverId",
        d."firstName" AS "driverFirstName",
        d."lastName" AS "driverLastName",
        l."latitude" AS "latitude",
        l."longitude" AS "longitude",
        l."accuracy" AS "accuracy",
        l."heading" AS "heading",
        l."speed" AS "speed",
        l."recordedAt" AS "recordedAt"
      FROM "Trip" t
      INNER JOIN "User" d ON d."id" = t."driverId"
      LEFT JOIN "TripLiveLocation" l ON l."tripId" = t."id"
      WHERE t."bookingReference" IS NOT NULL
        AND t."status"::text IN (
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'IN_PROGRESS'
        )
      ORDER BY
        CASE t."status"::text
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'DRIVER_ARRIVED' THEN 2
          WHEN 'DRIVER_ARRIVING' THEN 3
          ELSE 4
        END,
        t."requestedAt" DESC
    `;

    return rows.map((row) => ({
      tripId: row.tripId,
      bookingReference: row.bookingReference,
      status: row.status,
      driverId: row.driverId,
      driverFirstName: row.driverFirstName,
      driverLastName: row.driverLastName,
      liveLocation:
        row.recordedAt && row.latitude != null && row.longitude != null
          ? {
              tripId: row.tripId,
              driverId: row.driverId,
              latitude: row.latitude,
              longitude: row.longitude,
              accuracy: row.accuracy,
              heading: row.heading,
              speed: row.speed,
              recordedAt: row.recordedAt.toISOString()
            }
          : null
    }));
  }
}
