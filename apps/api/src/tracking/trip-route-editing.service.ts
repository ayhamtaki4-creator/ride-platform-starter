import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

type RouteInput = {
  geometry: unknown;
  waypoints?: unknown;
  distanceKm?: number;
  durationMinutes?: number;
};

type EditAccess = {
  dispatch: boolean;
  passengerOwner: boolean;
  trip: {
    id: string;
    routeId: string | null;
    pickupAddress: string;
    pickupLatitude: number;
    pickupLongitude: number;
    dropoffAddress: string;
    dropoffLatitude: number;
    dropoffLongitude: number;
  };
};

@Injectable()
export class TripRouteEditingService {
  constructor(private readonly prisma: PrismaService) {}

  async updateRoutePlan(user: AuthUser, tripId: string, input: RouteInput) {
    const access = await this.assertEditAccess(user, tripId);
    const route = this.validateRouteInput(input);

    await this.persistRoutePlan(
      this.prisma,
      user,
      tripId,
      route,
      access.passengerOwner && !access.dispatch
    );

    return this.getRoutePlan(tripId);
  }

  async updateEndpoints(
    user: AuthUser,
    tripId: string,
    input: RouteInput & {
      originAddress: string;
      originLatitude: number;
      originLongitude: number;
      destinationAddress: string;
      destinationLatitude: number;
      destinationLongitude: number;
    }
  ) {
    const access = await this.assertEditAccess(user, tripId);
    const route = this.validateRouteInput(input);
    const originAddress = this.address(input.originAddress, 'عنوان الانطلاق');
    const destinationAddress = this.address(input.destinationAddress, 'عنوان الوصول');
    const originLatitude = this.coordinate(input.originLatitude, 90, 'خط عرض الانطلاق');
    const originLongitude = this.coordinate(input.originLongitude, 180, 'خط طول الانطلاق');
    const destinationLatitude = this.coordinate(input.destinationLatitude, 90, 'خط عرض الوصول');
    const destinationLongitude = this.coordinate(input.destinationLongitude, 180, 'خط طول الوصول');

    if (access.passengerOwner && !access.dispatch) {
      const policy = await this.endpointPolicy(access.trip.routeId);
      if (
        !policy.passengerCanEditPickup &&
        this.endpointChanged(
          access.trip.pickupAddress,
          access.trip.pickupLatitude,
          access.trip.pickupLongitude,
          originAddress,
          originLatitude,
          originLongitude
        )
      ) {
        throw new ForbiddenException('نقطة الانطلاق ثابتة حسب إعدادات الإدارة لهذا المسار.');
      }
      if (
        !policy.passengerCanEditDropoff &&
        this.endpointChanged(
          access.trip.dropoffAddress,
          access.trip.dropoffLatitude,
          access.trip.dropoffLongitude,
          destinationAddress,
          destinationLatitude,
          destinationLongitude
        )
      ) {
        throw new ForbiddenException('نقطة الوصول ثابتة حسب إعدادات الإدارة لهذا المسار.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          pickupAddress: originAddress,
          pickupLatitude: originLatitude,
          pickupLongitude: originLongitude,
          dropoffAddress: destinationAddress,
          dropoffLatitude: destinationLatitude,
          dropoffLongitude: destinationLongitude,
          ...(route.distanceKm !== null ? { estimatedDistanceKm: route.distanceKm } : {}),
          ...(route.durationMinutes !== null ? { estimatedDurationMinutes: route.durationMinutes } : {})
        }
      });

      await this.persistRoutePlan(
        tx,
        user,
        tripId,
        route,
        access.passengerOwner && !access.dispatch
      );

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: access.passengerOwner && !access.dispatch
            ? 'trip.endpoints.passenger_update'
            : 'trip.endpoints.update',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            originAddress,
            originLatitude,
            originLongitude,
            destinationAddress,
            destinationLatitude,
            destinationLongitude
          }
        }
      });
    });

    return {
      trip: await this.prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: {
          id: true,
          pickupAddress: true,
          pickupLatitude: true,
          pickupLongitude: true,
          dropoffAddress: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
          estimatedDistanceKm: true,
          estimatedDurationMinutes: true
        }
      }),
      routePlan: await this.getRoutePlan(tripId)
    };
  }

  private async assertEditAccess(user: AuthUser, tripId: string): Promise<EditAccess> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        passengerId: true,
        routeId: true,
        status: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true
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

    return { dispatch, passengerOwner, trip };
  }

  private async endpointPolicy(routeId: string | null) {
    if (!routeId) {
      return { passengerCanEditPickup: false, passengerCanEditDropoff: false };
    }

    const route = await this.prisma.serviceRoute.findUnique({
      where: { id: routeId },
      include: { origin: true, destination: true }
    });
    if (!route) {
      return { passengerCanEditPickup: false, passengerCanEditDropoff: false };
    }

    const rows = await this.prisma.$queryRaw<Array<{
      passengerCanEditPickup: boolean;
      passengerCanEditDropoff: boolean;
    }>>(Prisma.sql`
      SELECT "passengerCanEditPickup", "passengerCanEditDropoff"
      FROM "RouteBookingPolicy"
      WHERE "routeId" = ${routeId}::uuid
      LIMIT 1
    `).catch(() => [] as Array<{
      passengerCanEditPickup: boolean;
      passengerCanEditDropoff: boolean;
    }>);

    return rows[0] ?? {
      passengerCanEditPickup: route.origin.type !== 'AIRPORT',
      passengerCanEditDropoff: route.destination.type !== 'AIRPORT'
    };
  }

  private endpointChanged(
    currentAddress: string,
    currentLatitude: number,
    currentLongitude: number,
    nextAddress: string,
    nextLatitude: number,
    nextLongitude: number
  ) {
    return (
      currentAddress.trim() !== nextAddress.trim() ||
      Math.abs(currentLatitude - nextLatitude) > 0.000001 ||
      Math.abs(currentLongitude - nextLongitude) > 0.000001
    );
  }

  private validateRouteInput(input: RouteInput) {
    return {
      geometry: this.validateGeometry(input.geometry),
      waypoints: this.validateWaypoints(input.waypoints),
      distanceKm: this.optionalPositive(input.distanceKm, 'المسافة'),
      durationMinutes: this.optionalPositiveInteger(input.durationMinutes, 'المدة')
    };
  }

  private async persistRoutePlan(
    client: PrismaService | Prisma.TransactionClient,
    user: AuthUser,
    tripId: string,
    route: {
      geometry: { type?: unknown; coordinates?: unknown };
      waypoints: Array<{ latitude: number; longitude: number; label?: string }>;
      distanceKm: number | null;
      durationMinutes: number | null;
    },
    updatedByPassenger: boolean
  ) {
    await client.$executeRaw`
      INSERT INTO "TripRoutePlan" (
        "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes",
        "version", "updatedById", "createdAt", "updatedAt"
      ) VALUES (
        ${tripId}::uuid, ${JSON.stringify(route.geometry)}::jsonb, ${JSON.stringify(route.waypoints)}::jsonb,
        ${route.distanceKm}, ${route.durationMinutes}, 1, ${user.sub}::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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

    await client.auditLog.create({
      data: {
        actorId: user.sub,
        action: updatedByPassenger ? 'trip.route_plan.passenger_update' : 'trip.route_plan.update',
        entityType: 'Trip',
        entityId: tripId,
        metadata: {
          waypointCount: route.waypoints.length,
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          updatedByPassenger
        }
      }
    });
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

  private address(value: string, label: string) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 180) {
      throw new BadRequestException(`${label} غير صالح.`);
    }
    return trimmed;
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
