import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';

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

type LiveLocationRow = {
  tripId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: Date;
};

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async getTripTracking(user: AuthUser, tripId: string) {
    const trip = await this.requireTripAccess(user, tripId);
    return this.buildTrackingPayload(trip);
  }

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
        driverId: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffLatitude: true,
        dropoffLongitude: true
      }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    if (trip.driverId) {
      throw new ForbiddenException('تم قفل المسار بعد تعيين السائق. ألغِ التعيين أولًا لتعديله.');
    }

    const geometry = this.validateGeometry(input.geometry);
    const waypoints = Array.isArray(input.waypoints) ? input.waypoints : [];
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

    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'trip.route_plan.update',
        entityType: 'Trip',
        entityId: tripId,
        metadata: {
          waypointCount: waypoints.length,
          distanceKm: distanceKm ?? null,
          durationMinutes: durationMinutes ?? null
        }
      }
    });

    return this.getRoutePlan(tripId);
  }

  async updateDriverLocation(
    user: AuthUser,
    tripId: string,
    input: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
      recordedAt?: string;
    }
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, driverId: true, status: true }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    if (trip.driverId !== user.sub) {
      throw new ForbiddenException('هذه الرحلة ليست معيّنة لك.');
    }
    if (!['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(trip.status)) {
      throw new ForbiddenException('لا يمكن إرسال الموقع في حالة الرحلة الحالية.');
    }

    const latitude = this.coordinate(input.latitude, 90, 'خط العرض');
    const longitude = this.coordinate(input.longitude, 180, 'خط الطول');
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException('وقت الموقع غير صالح.');

    await this.prisma.$executeRaw`
      INSERT INTO "TripLiveLocation" (
        "tripId", "driverId", "latitude", "longitude", "accuracy", "heading", "speed", "recordedAt", "updatedAt"
      ) VALUES (
        ${tripId}::uuid, ${user.sub}::uuid, ${latitude}, ${longitude},
        ${this.nullableFinite(input.accuracy)}, ${this.nullableFinite(input.heading)}, ${this.nullableFinite(input.speed)},
        ${recordedAt}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tripId") DO UPDATE SET
        "driverId" = EXCLUDED."driverId",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "accuracy" = EXCLUDED."accuracy",
        "heading" = EXCLUDED."heading",
        "speed" = EXCLUDED."speed",
        "recordedAt" = EXCLUDED."recordedAt",
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    return {
      tripId,
      driverId: user.sub,
      latitude,
      longitude,
      accuracy: this.nullableFinite(input.accuracy),
      heading: this.nullableFinite(input.heading),
      speed: this.nullableFinite(input.speed),
      recordedAt: recordedAt.toISOString()
    };
  }

  async createShare(user: AuthUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, passengerId: true, status: true }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    if (trip.passengerId !== user.sub) throw new ForbiddenException('لا يمكنك مشاركة هذه الرحلة.');
    if (['COMPLETED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER'].includes(trip.status)) {
      throw new BadRequestException('انتهت الرحلة ولا يمكن إنشاء رابط تتبع جديد.');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(token);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 36 * 60 * 60 * 1000);

    await this.prisma.$executeRaw`
      INSERT INTO "TripTrackingShare" ("id", "tripId", "tokenHash", "expiresAt", "createdAt")
      VALUES (${id}::uuid, ${tripId}::uuid, ${tokenHash}, ${expiresAt}, CURRENT_TIMESTAMP)
    `;

    return { id, token, expiresAt: expiresAt.toISOString() };
  }

  async revokeShare(user: AuthUser, tripId: string, shareId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { passengerId: true }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    if (trip.passengerId !== user.sub) throw new ForbiddenException('لا يمكنك إلغاء هذا الرابط.');

    await this.prisma.$executeRaw`
      UPDATE "TripTrackingShare"
      SET "revokedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${shareId}::uuid AND "tripId" = ${tripId}::uuid AND "revokedAt" IS NULL
    `;
    return { success: true };
  }

  async getPublicTracking(token: string) {
    const tokenHash = this.hash(token);
    const rows = await this.prisma.$queryRaw<Array<{ tripId: string }>>`
      SELECT "tripId"
      FROM "TripTrackingShare"
      WHERE "tokenHash" = ${tokenHash}
        AND "revokedAt" IS NULL
        AND "expiresAt" > CURRENT_TIMESTAMP
      LIMIT 1
    `;
    const share = rows[0];
    if (!share) throw new NotFoundException('رابط التتبع غير صالح أو انتهت صلاحيته.');

    const trip = await this.prisma.trip.findUnique({
      where: { id: share.tripId },
      select: {
        id: true,
        status: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        travelDate: true,
        driver: {
          select: {
            firstName: true,
            lastName: true,
            driverProfile: { select: { avatarUrl: true } }
          }
        }
      }
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة.');

    const payload = await this.buildTrackingPayload(trip);
    return {
      ...payload,
      trip: {
        id: trip.id,
        status: trip.status,
        pickupAddress: trip.pickupAddress,
        dropoffAddress: trip.dropoffAddress,
        travelDate: trip.travelDate,
        driver: trip.driver
          ? { firstName: trip.driver.firstName, lastName: trip.driver.lastName }
          : null
      }
    };
  }

  private async requireTripAccess(user: AuthUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        passengerId: true,
        driverId: true,
        status: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        travelDate: true
      }
    });
    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    const dispatch = user.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role));
    if (!dispatch && trip.passengerId !== user.sub && trip.driverId !== user.sub) {
      throw new ForbiddenException('لا يمكنك متابعة هذه الرحلة.');
    }
    return trip;
  }

  private async buildTrackingPayload(trip: {
    id: string;
    status: string;
    pickupAddress: string;
    pickupLatitude: number;
    pickupLongitude: number;
    dropoffAddress: string;
    dropoffLatitude: number;
    dropoffLongitude: number;
    travelDate: Date | null;
  }) {
    const [routePlan, liveLocation] = await Promise.all([
      this.getRoutePlan(trip.id),
      this.getLiveLocation(trip.id)
    ]);
    return {
      trip: {
        id: trip.id,
        status: trip.status,
        pickupAddress: trip.pickupAddress,
        pickupLatitude: trip.pickupLatitude,
        pickupLongitude: trip.pickupLongitude,
        dropoffAddress: trip.dropoffAddress,
        dropoffLatitude: trip.dropoffLatitude,
        dropoffLongitude: trip.dropoffLongitude,
        travelDate: trip.travelDate
      },
      routePlan,
      liveLocation
    };
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

  private async getLiveLocation(tripId: string) {
    const rows = await this.prisma.$queryRaw<LiveLocationRow[]>`
      SELECT "tripId", "driverId", "latitude", "longitude", "accuracy", "heading", "speed", "recordedAt"
      FROM "TripLiveLocation"
      WHERE "tripId" = ${tripId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private validateGeometry(value: unknown) {
    if (!value || typeof value !== 'object') throw new BadRequestException('هندسة المسار غير صحيحة.');
    const geometry = value as { type?: unknown; coordinates?: unknown };
    if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      throw new BadRequestException('يجب أن يكون المسار LineString ويحتوي نقطتين على الأقل.');
    }
    for (const coordinate of geometry.coordinates) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) throw new BadRequestException('إحداثيات المسار غير صحيحة.');
      this.coordinate(Number(coordinate[1]), 90, 'خط العرض');
      this.coordinate(Number(coordinate[0]), 180, 'خط الطول');
    }
    return geometry;
  }

  private coordinate(value: number, limit: number, label: string) {
    if (!Number.isFinite(value) || Math.abs(value) > limit) throw new BadRequestException(`${label} غير صالح.`);
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

  private nullableFinite(value: number | undefined) {
    return value == null || !Number.isFinite(value) ? null : value;
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
