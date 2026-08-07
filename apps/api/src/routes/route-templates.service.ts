import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';

type RouteTemplateRow = {
  routeId: string;
  originAddress: string;
  originLatitude: number;
  originLongitude: number;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  geometry: unknown;
  waypoints: unknown;
  distanceKm: number | null;
  durationMinutes: number | null;
  updatedAt: Date;
};

type RouteTemplateInput = {
  originAddress: string;
  originLatitude: number;
  originLongitude: number;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  geometry?: unknown;
  waypoints?: unknown;
  distanceKm?: number;
  durationMinutes?: number;
};

type TripEndpointsInput = RouteTemplateInput;

type RouteBookingPolicyRow = {
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
};

const TERMINAL_OR_STARTED = [
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'NO_DRIVER_AVAILABLE',
  'PASSENGER_NO_SHOW',
  'DRIVER_NO_SHOW'
];

@Injectable()
export class RouteTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList() {
    const rows = await this.prisma.$queryRaw<RouteTemplateRow[]>`
      SELECT
        t."routeId", t."originAddress", t."originLatitude", t."originLongitude",
        t."destinationAddress", t."destinationLatitude", t."destinationLongitude",
        t."geometry", t."waypoints", t."distanceKm", t."durationMinutes", t."updatedAt"
      FROM "ServiceRouteTemplate" t
      INNER JOIN "ServiceRoute" r ON r."id" = t."routeId"
      WHERE r."isActive" = true
      ORDER BY r."nameAr" ASC
    `;
    return rows.map((row) => this.serialize(row));
  }

  async publicGet(routeId: string) {
    const rows = await this.prisma.$queryRaw<RouteTemplateRow[]>`
      SELECT
        t."routeId", t."originAddress", t."originLatitude", t."originLongitude",
        t."destinationAddress", t."destinationLatitude", t."destinationLongitude",
        t."geometry", t."waypoints", t."distanceKm", t."durationMinutes", t."updatedAt"
      FROM "ServiceRouteTemplate" t
      INNER JOIN "ServiceRoute" r ON r."id" = t."routeId"
      WHERE t."routeId" = ${routeId}::uuid AND r."isActive" = true
      LIMIT 1
    `;
    const template = rows[0];
    if (!template) throw new NotFoundException('لا يوجد قالب مسار محفوظ لهذا الخط.');
    return this.serialize(template);
  }

  async adminList() {
    const [routes, rows] = await Promise.all([
      this.prisma.serviceRoute.findMany({
        orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
        include: { origin: true, destination: true }
      }),
      this.prisma.$queryRaw<RouteTemplateRow[]>`
        SELECT
          "routeId", "originAddress", "originLatitude", "originLongitude",
          "destinationAddress", "destinationLatitude", "destinationLongitude",
          "geometry", "waypoints", "distanceKm", "durationMinutes", "updatedAt"
        FROM "ServiceRouteTemplate"
      `
    ]);
    const byRoute = new Map(rows.map((row) => [row.routeId, this.serialize(row)]));
    return routes.map((route) => ({ route, template: byRoute.get(route.id) ?? null }));
  }

  async adminGet(routeId: string) {
    const route = await this.prisma.serviceRoute.findUnique({
      where: { id: routeId },
      include: { origin: true, destination: true }
    });
    if (!route) throw new NotFoundException('المسار غير موجود.');
    const template = await this.getTemplate(routeId);
    return { route, template: template ? this.serialize(template) : null };
  }

  async save(actor: AuthUser, routeId: string, input: RouteTemplateInput) {
    const route = await this.prisma.serviceRoute.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundException('المسار غير موجود.');

    const value = this.validateInput(input);
    await this.prisma.$executeRaw`
      INSERT INTO "ServiceRouteTemplate" (
        "routeId",
        "originAddress", "originLatitude", "originLongitude",
        "destinationAddress", "destinationLatitude", "destinationLongitude",
        "geometry", "waypoints", "distanceKm", "durationMinutes",
        "updatedById", "createdAt", "updatedAt"
      ) VALUES (
        ${routeId}::uuid,
        ${value.originAddress}, ${value.originLatitude}, ${value.originLongitude},
        ${value.destinationAddress}, ${value.destinationLatitude}, ${value.destinationLongitude},
        ${JSON.stringify(value.geometry)}::jsonb,
        ${JSON.stringify(value.waypoints)}::jsonb,
        ${value.distanceKm}, ${value.durationMinutes},
        ${actor.sub}::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("routeId") DO UPDATE SET
        "originAddress" = EXCLUDED."originAddress",
        "originLatitude" = EXCLUDED."originLatitude",
        "originLongitude" = EXCLUDED."originLongitude",
        "destinationAddress" = EXCLUDED."destinationAddress",
        "destinationLatitude" = EXCLUDED."destinationLatitude",
        "destinationLongitude" = EXCLUDED."destinationLongitude",
        "geometry" = EXCLUDED."geometry",
        "waypoints" = EXCLUDED."waypoints",
        "distanceKm" = EXCLUDED."distanceKm",
        "durationMinutes" = EXCLUDED."durationMinutes",
        "updatedById" = EXCLUDED."updatedById",
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'service_route.template.update',
        entityType: 'ServiceRoute',
        entityId: routeId,
        metadata: {
          originAddress: value.originAddress,
          destinationAddress: value.destinationAddress,
          waypointCount: value.waypoints.length,
          distanceKm: value.distanceKm,
          durationMinutes: value.durationMinutes
        }
      }
    });

    const saved = await this.getTemplate(routeId);
    if (!saved) throw new NotFoundException('تعذر قراءة قالب المسار بعد الحفظ.');
    return this.serialize(saved);
  }

  async updateTripEndpoints(actor: AuthUser, tripId: string, input: TripEndpointsInput) {
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

    const dispatch = actor.roles.some((role) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role)
    );
    if (!dispatch && trip.passengerId !== actor.sub) {
      throw new ForbiddenException('لا يمكنك تعديل نقاط هذا الحجز.');
    }
    if (TERMINAL_OR_STARTED.includes(trip.status)) {
      throw new ForbiddenException('لا يمكن تعديل نقاط المسار بعد بدء الرحلة أو انتهائها.');
    }

    const value = this.validateInput(input);
    if (!dispatch && trip.routeId) {
      const policyRows = await this.prisma.$queryRaw<RouteBookingPolicyRow[]>(Prisma.sql`
        SELECT "passengerCanEditPickup", "passengerCanEditDropoff"
        FROM "RouteBookingPolicy"
        WHERE "routeId" = ${trip.routeId}::uuid
        LIMIT 1
      `);
      const policy = policyRows[0];
      if (policy) {
        if (
          !policy.passengerCanEditPickup &&
          this.endpointChanged(
            trip.pickupAddress,
            trip.pickupLatitude,
            trip.pickupLongitude,
            value.originAddress,
            value.originLatitude,
            value.originLongitude
          )
        ) {
          throw new ForbiddenException('نقطة الانطلاق ثابتة حسب إعدادات الإدارة لهذا المسار.');
        }
        if (
          !policy.passengerCanEditDropoff &&
          this.endpointChanged(
            trip.dropoffAddress,
            trip.dropoffLatitude,
            trip.dropoffLongitude,
            value.destinationAddress,
            value.destinationLatitude,
            value.destinationLongitude
          )
        ) {
          throw new ForbiddenException('نقطة الوصول ثابتة حسب إعدادات الإدارة لهذا المسار.');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          pickupAddress: value.originAddress,
          pickupLatitude: value.originLatitude,
          pickupLongitude: value.originLongitude,
          dropoffAddress: value.destinationAddress,
          dropoffLatitude: value.destinationLatitude,
          dropoffLongitude: value.destinationLongitude,
          ...(value.distanceKm !== null ? { estimatedDistanceKm: value.distanceKm } : {}),
          ...(value.durationMinutes !== null
            ? { estimatedDurationMinutes: value.durationMinutes }
            : {})
        }
      });

      await tx.$executeRaw`
        INSERT INTO "TripRoutePlan" (
          "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes",
          "version", "updatedById", "createdAt", "updatedAt"
        ) VALUES (
          ${tripId}::uuid,
          ${JSON.stringify(value.geometry)}::jsonb,
          ${JSON.stringify(value.waypoints)}::jsonb,
          ${value.distanceKm}, ${value.durationMinutes}, 1,
          ${actor.sub}::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: dispatch ? 'trip.endpoints.admin_update' : 'trip.endpoints.passenger_update',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            originAddress: value.originAddress,
            destinationAddress: value.destinationAddress,
            waypointCount: value.waypoints.length
          }
        }
      });
    });

    return { success: true };
  }

  private async getTemplate(routeId: string) {
    const rows = await this.prisma.$queryRaw<RouteTemplateRow[]>`
      SELECT
        "routeId", "originAddress", "originLatitude", "originLongitude",
        "destinationAddress", "destinationLatitude", "destinationLongitude",
        "geometry", "waypoints", "distanceKm", "durationMinutes", "updatedAt"
      FROM "ServiceRouteTemplate"
      WHERE "routeId" = ${routeId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private validateInput(input: RouteTemplateInput) {
    const originAddress = input.originAddress?.trim();
    const destinationAddress = input.destinationAddress?.trim();
    if (!originAddress || !destinationAddress) {
      throw new BadRequestException('يجب تحديد عنوان الانطلاق والوصول.');
    }

    const originLatitude = this.coordinate(input.originLatitude, 90, 'خط عرض الانطلاق');
    const originLongitude = this.coordinate(input.originLongitude, 180, 'خط طول الانطلاق');
    const destinationLatitude = this.coordinate(
      input.destinationLatitude,
      90,
      'خط عرض الوصول'
    );
    const destinationLongitude = this.coordinate(
      input.destinationLongitude,
      180,
      'خط طول الوصول'
    );
    const geometry = input.geometry == null
      ? {
          type: 'LineString' as const,
          coordinates: [
            [originLongitude, originLatitude],
            [destinationLongitude, destinationLatitude]
          ]
        }
      : this.validateGeometry(input.geometry);
    const waypoints = this.validateWaypoints(input.waypoints);
    const distanceKm = this.optionalPositive(input.distanceKm, 'المسافة');
    const durationMinutes = this.optionalPositiveInteger(input.durationMinutes, 'المدة');

    return {
      originAddress,
      originLatitude,
      originLongitude,
      destinationAddress,
      destinationLatitude,
      destinationLongitude,
      geometry,
      waypoints,
      distanceKm,
      durationMinutes
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
    if (value == null) return [] as Array<{ latitude: number; longitude: number; label?: string }>;
    if (!Array.isArray(value)) throw new BadRequestException('نقاط المرور غير صحيحة.');
    return value.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new BadRequestException('إحدى نقاط المرور غير صحيحة.');
      }
      const point = entry as { latitude?: unknown; longitude?: unknown; label?: unknown };
      return {
        latitude: this.coordinate(Number(point.latitude), 90, 'خط عرض نقطة المرور'),
        longitude: this.coordinate(Number(point.longitude), 180, 'خط طول نقطة المرور'),
        ...(typeof point.label === 'string' && point.label.trim()
          ? { label: point.label.trim().slice(0, 300) }
          : {})
      };
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
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${label} غير صالحة.`);
    }
    return value;
  }

  private optionalPositiveInteger(value: number | undefined, label: string) {
    if (value == null) return null;
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${label} غير صالحة.`);
    }
    return value;
  }

  private serialize(row: RouteTemplateRow) {
    return {
      ...row,
      geometry: row.geometry as Prisma.JsonValue | null,
      waypoints: (Array.isArray(row.waypoints) ? row.waypoints : []) as Prisma.JsonValue,
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
