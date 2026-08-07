import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRouteBookingPolicyDto } from './dto/update-route-booking-policy.dto';

type PolicyRow = {
  routeId: string;
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
  flightTimeMode: 'ARRIVAL' | 'DEPARTURE';
};

type AdminPolicyRow = PolicyRow & {
  routeCode: string;
  routeNameAr: string;
  requiresFlightDetails: boolean;
  originNameAr: string;
  originType: string;
  destinationNameAr: string;
  destinationType: string;
};

@Injectable()
export class RouteBookingPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList(): Promise<PolicyRow[]> {
    try {
      return await this.prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
        SELECT
          policy."routeId",
          policy."passengerCanEditPickup",
          policy."passengerCanEditDropoff",
          policy."flightTimeMode"
        FROM "RouteBookingPolicy" policy
        JOIN "ServiceRoute" route ON route."id" = policy."routeId"
        WHERE route."isActive" = TRUE
        ORDER BY route."nameAr" ASC
      `);
    } catch {
      const routes = await this.prisma.serviceRoute.findMany({
        where: { isActive: true },
        orderBy: { nameAr: 'asc' },
        include: { origin: true, destination: true }
      });
      return routes.map((route) => this.defaultPolicy(
        route.id,
        route.origin.type,
        route.destination.type
      ));
    }
  }

  async adminList(): Promise<AdminPolicyRow[]> {
    try {
      return await this.prisma.$queryRaw<AdminPolicyRow[]>(Prisma.sql`
        SELECT
          policy."routeId",
          policy."passengerCanEditPickup",
          policy."passengerCanEditDropoff",
          policy."flightTimeMode",
          route."code" AS "routeCode",
          route."nameAr" AS "routeNameAr",
          route."requiresFlightDetails",
          origin."nameAr" AS "originNameAr",
          origin."type"::text AS "originType",
          destination."nameAr" AS "destinationNameAr",
          destination."type"::text AS "destinationType"
        FROM "RouteBookingPolicy" policy
        JOIN "ServiceRoute" route ON route."id" = policy."routeId"
        JOIN "ServiceLocation" origin ON origin."id" = route."originId"
        JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
        ORDER BY route."isActive" DESC, route."nameAr" ASC
      `);
    } catch {
      const routes = await this.prisma.serviceRoute.findMany({
        orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
        include: { origin: true, destination: true }
      });
      return routes.map((route) => ({
        ...this.defaultPolicy(route.id, route.origin.type, route.destination.type),
        routeCode: route.code,
        routeNameAr: route.nameAr,
        requiresFlightDetails: route.requiresFlightDetails,
        originNameAr: route.origin.nameAr,
        originType: route.origin.type,
        destinationNameAr: route.destination.nameAr,
        destinationType: route.destination.type
      }));
    }
  }

  async update(actor: AuthUser, routeId: string, dto: UpdateRouteBookingPolicyDto) {
    const route = await this.prisma.serviceRoute.findUnique({
      where: { id: routeId },
      select: { id: true, code: true }
    });
    if (!route) throw new NotFoundException('المسار غير موجود.');

    await this.ensurePolicy(routeId);
    const rows = await this.prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
      UPDATE "RouteBookingPolicy"
      SET
        "passengerCanEditPickup" = COALESCE(${dto.passengerCanEditPickup ?? null}::boolean, "passengerCanEditPickup"),
        "passengerCanEditDropoff" = COALESCE(${dto.passengerCanEditDropoff ?? null}::boolean, "passengerCanEditDropoff"),
        "flightTimeMode" = COALESCE(${dto.flightTimeMode ?? null}::text, "flightTimeMode"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "routeId" = ${routeId}::uuid
      RETURNING
        "routeId",
        "passengerCanEditPickup",
        "passengerCanEditDropoff",
        "flightTimeMode"
    `);

    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'service_route.booking_policy.update',
        entityType: 'ServiceRoute',
        entityId: routeId,
        metadata: {
          routeCode: route.code,
          passengerCanEditPickup: rows[0]?.passengerCanEditPickup,
          passengerCanEditDropoff: rows[0]?.passengerCanEditDropoff,
          flightTimeMode: rows[0]?.flightTimeMode
        }
      }
    });

    return rows[0];
  }

  private defaultPolicy(routeId: string, originType: string, destinationType: string): PolicyRow {
    return {
      routeId,
      passengerCanEditPickup: originType !== 'AIRPORT',
      passengerCanEditDropoff: destinationType !== 'AIRPORT',
      flightTimeMode: destinationType === 'AIRPORT' ? 'DEPARTURE' : 'ARRIVAL'
    };
  }

  private async ensurePolicy(routeId: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RouteBookingPolicy" (
        "routeId",
        "passengerCanEditPickup",
        "passengerCanEditDropoff",
        "flightTimeMode"
      )
      SELECT
        route."id",
        CASE WHEN origin."type"::text = 'AIRPORT' THEN FALSE ELSE TRUE END,
        CASE WHEN destination."type"::text = 'AIRPORT' THEN FALSE ELSE TRUE END,
        CASE WHEN destination."type"::text = 'AIRPORT' THEN 'DEPARTURE' ELSE 'ARRIVAL' END
      FROM "ServiceRoute" route
      JOIN "ServiceLocation" origin ON origin."id" = route."originId"
      JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
      WHERE route."id" = ${routeId}::uuid
      ON CONFLICT ("routeId") DO NOTHING
    `);
  }
}
