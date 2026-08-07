import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';

const LOCKED_TRIP_STATUSES = [
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'NO_DRIVER_AVAILABLE',
  'PASSENGER_NO_SHOW',
  'DRIVER_NO_SHOW'
] as const;

type RoutePlanRow = {
  tripId: string;
  geometry: unknown;
  waypoints: unknown;
  distanceKm: number | null;
  durationMinutes: number | null;
  version: number;
  lockedAt: Date | null;
  updatedAt: Date;
};

@Injectable()
export class TripRouteEditingService {
  constructor(private readonly prisma: PrismaService) {}

  async updateRoutePlan(
    user: AuthUser,
    tripId: string,
    input: {
      geometry: unknown;
      waypoints?: unknown;
      distanceKm?: number;
      durationMinutes?: number;
    }
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        passengerId: true,
        status: true
      }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');

    const dispatch = user.roles.some((role) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role)
    );
    const passengerOwner = trip.passengerId === user.sub;
    if (!dispatch && !passengerOwner) {
      throw new ForbiddenException('لا يمكنك تعديل مسار هذه الرحلة.');
    }

    if (LOCKED_TRIP_STATUSES.includes(trip.status as (typeof LOCKED_TRIP_STATUSES)[number])) {
      throw new ForbiddenException('تم قفل المسار بعد بدء الرحلة ولا يمكن تعديله.');
    }

    const geometry = this.validateGeometry(input.geometry);
    const waypoints = this.validateWaypoints(input.waypoints);
    const distanceKm = this.optionalPositive(input.distanceKm, 'المسافة');
    const durationMinutes = this.optionalPositiveInteger(input.durationMinutes, 'المدة');

    await this.prisma.$executeRaw`
      INSERT INTO "TripRoutePlan" (
        "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes",
        "version", "updatedById", "createdAt", "updatedAt"
      ) VALUES (
        ${tripId}::uuid, ${JSON.stringify(geometry)}::jsonb, ${JSON.stringify(waypoints)}::jsonb,
        ${distanceKm}, ${durationMinutes}, 1, ${user.sub}::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tripId") DO UPDATE SET
        "geometry" = EXCLUDED."geometry",
        "waypoints" = EXCLUDED."waypoints",
        "distanceKm" = EXCLUDED."distanceKm",
        "durationMinutes" = EXCLUDED."durationMinutes",
        "version" = "TripRoutePlan"."version" + 1,
        "updatedById" = EXCLUDED."updatedById",
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    if (distanceKm !== null || durationMinutes !== null) {
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          ...(distanceKm !== null ? { estimatedDistanceKm: distanceKm } : {}),
          ...(durationMinutes !== null ? { estimatedDurationMinutes: durationMinutes } : {})
        }
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: passengerOwner && !dispatch ? 'trip.route_plan.passenger_update' : 'trip.route_plan.update',
        entityType: 'Trip',
        entityId: tripId,
        metadata: {
          waypointCount: waypoints.length,
          distanceKm: distanceKm ?? null,
          durationMinutes: durationMinutes ?? null,
          updatedByPassenger: passengerOwner && !dispatch
        }
      }
    });

    return this.getRoutePlan(tripId);
  }

  private async getRoutePlan(tripId: string) {
    const rows = await this.prisma.$queryRaw<RoutePlanRow[]>`
      SELECT "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes", "version", "lockedAt", "updatedAt"
      FROM "TripRoutePlan"
      WHERE "tripId" = ${tripId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private validateGeometry(value: unknown) {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('هندسة المسار غير صحيحة.');
    }
    const geometry = value as { type?: unknown; coordinates?: unknown };
    if (
      geometry.type !== 'LineString' ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length < 2
    ) {
      throw new BadRequestException('يجب أن يكون المسار LineString ويحتوي نقطتين على الأقل.');
    }
    for (const coordinate of geometry.coordinates) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        throw new BadRequestException('إحداثيات المسار غير صحيحة.');
      }
      this.coordinate(Number(coordinate[1]), 90, 'خط العرض');
      this.coordinate(Number(coordinate[0]), 180, 'خط الطول');
    }
    return geometry;
  }

  private validateWaypoints(value: unknown) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new BadRequestException('نقاط المرور غير صحيحة.');
    return value.map((item) => {
      if (!item || typeof item !== 'object') throw new BadRequestException('نقطة مرور غير صحيحة.');
      const point = item as { latitude?: unknown; longitude?: unknown; label?: unknown };
      const latitude = this.coordinate(Number(point.latitude), 90, 'خط العرض');
      const longitude = this.coordinate(Number(point.longitude), 180, 'خط الطول');
      const label = typeof point.label === 'string' ? point.label.trim().slice(0, 180) : undefined;
      return { latitude, longitude, ...(label ? { label } : {}) };
    });
  }

  private coordinate(value: number, limit: number, label: string) {
    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      throw new BadRequestException(`${label} غير صالح.`);
    }
    return value;
  }

  private optionalPositive(value: number | undefined, label: string) {
    if (value == null) return null;
    if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${label} غير صالحة.`);
    return value;
  }

  private optionalPositiveInteger(value: number | undefined, label: string) {
    if (value == null) return null;
    if (!Number.isInteger(value) || value < 0) throw new BadRequestException(`${label} غير صالحة.`);
    return value;
  }
}
