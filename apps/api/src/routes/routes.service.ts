import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, ServiceRunStatus, VehicleClass } from '@prisma/client';
import { ComplianceService } from '../compliance/compliance.service';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_VEHICLE_CLASS_CONFIGS,
  minimumVehicleCapacity,
  VehicleClassCapacity
} from '../pricing/vehicle-class';
import { CreateLocationDto } from './dto/create-location.dto';
import { CreateRegionDto } from './dto/create-region.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { EligibleDriversQueryDto } from './dto/eligible-drivers-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { UpdateRouteDto } from './dto/update-route.dto';

const ACTIVE_RUN_STATUSES: ServiceRunStatus[] = [
  'DRAFT',
  'PLANNED',
  'SCHEDULED',
  'DRIVER_PENDING',
  'DRIVER_ACCEPTED',
  'BOARDING',
  'IN_PROGRESS',
  'DRIVER_REPLACEMENT_REQUIRED'
];

const routeInclude = {
  origin: true,
  destination: true,
  requiredRegions: {
    include: { region: true },
    orderBy: { region: { code: 'asc' as const } }
  },
  pricingRules: {
    orderBy: { bookingType: 'asc' as const }
  }
} satisfies Prisma.ServiceRouteInclude;

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService
  ) {}

  async publicList() {
    const [routes, vehicleClasses] = await Promise.all([
      this.prisma.serviceRoute.findMany({
        where: {
          isActive: true,
          origin: { isActive: true },
          destination: { isActive: true }
        },
        orderBy: [{ routeType: 'asc' }, { nameAr: 'asc' }],
        include: routeInclude
      }),
      this.vehicleClassConfigs()
    ]);

    return routes.map((route) => this.serializeRoute(route, true, vehicleClasses));
  }

  async publicDetail(id: string) {
    const [route, vehicleClasses] = await Promise.all([
      this.prisma.serviceRoute.findFirst({
        where: { id, isActive: true },
        include: routeInclude
      }),
      this.vehicleClassConfigs()
    ]);
    if (!route) throw new NotFoundException('المسار غير موجود أو غير فعال.');
    return this.serializeRoute(route, true, vehicleClasses);
  }

  adminRegions() {
    return this.prisma.serviceRegion.findMany({
      orderBy: [{ kind: 'asc' }, { countryCode: 'asc' }, { nameAr: 'asc' }]
    });
  }

  async createRegion(actor: AuthUser, dto: CreateRegionDto) {
    const code = this.normalizeCode(dto.code);
    const existing = await this.prisma.serviceRegion.findUnique({ where: { code } });
    if (existing) throw new ConflictException('رمز المنطقة مستخدم مسبقًا.');

    const region = await this.prisma.serviceRegion.create({
      data: {
        code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || null,
        countryCode: dto.countryCode.trim().toUpperCase(),
        kind: dto.kind,
        isActive: dto.isActive ?? true
      }
    });
    await this.audit(actor, 'service_region.create', 'ServiceRegion', region.id, {
      code: region.code,
      kind: region.kind
    });
    return region;
  }

  async updateRegion(actor: AuthUser, id: string, dto: UpdateRegionDto) {
    const current = await this.prisma.serviceRegion.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('منطقة التشغيل غير موجودة.');

    const region = await this.prisma.serviceRegion.update({
      where: { id },
      data: {
        ...(dto.code ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.nameAr ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() || null } : {}),
        ...(dto.countryCode
          ? { countryCode: dto.countryCode.trim().toUpperCase() }
          : {}),
        ...(dto.kind ? { kind: dto.kind } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      }
    });
    await this.audit(actor, 'service_region.update', 'ServiceRegion', id, {
      from: current.code,
      to: region.code,
      kind: region.kind
    });
    return region;
  }

  adminLocations() {
    return this.prisma.serviceLocation.findMany({
      orderBy: [{ countryCode: 'asc' }, { nameAr: 'asc' }]
    });
  }

  async createLocation(actor: AuthUser, dto: CreateLocationDto) {
    const code = this.normalizeCode(dto.code);
    const existing = await this.prisma.serviceLocation.findUnique({ where: { code } });
    if (existing) throw new ConflictException('رمز الموقع مستخدم مسبقًا.');

    const location = await this.prisma.serviceLocation.create({
      data: {
        code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || null,
        type: dto.type,
        countryCode: dto.countryCode.trim().toUpperCase(),
        city: dto.city?.trim() || null,
        governorate: dto.governorate?.trim() || null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isActive: dto.isActive ?? true
      }
    });

    await this.audit(actor, 'service_location.create', 'ServiceLocation', location.id, {
      code: location.code
    });
    return location;
  }

  async updateLocation(actor: AuthUser, id: string, dto: UpdateLocationDto) {
    const current = await this.prisma.serviceLocation.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('الموقع غير موجود.');

    const location = await this.prisma.serviceLocation.update({
      where: { id },
      data: {
        ...(dto.code ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.nameAr ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() || null } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.countryCode
          ? { countryCode: dto.countryCode.trim().toUpperCase() }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() || null } : {}),
        ...(dto.governorate !== undefined
          ? { governorate: dto.governorate.trim() || null }
          : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      }
    });

    await this.audit(actor, 'service_location.update', 'ServiceLocation', id, {
      from: current.code,
      to: location.code
    });
    return location;
  }

  adminRoutes() {
    return this.prisma.serviceRoute.findMany({
      orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
      include: routeInclude
    });
  }

  async createRoute(actor: AuthUser, dto: CreateRouteDto) {
    if (dto.originId === dto.destinationId) {
      throw new BadRequestException('نقطة الانطلاق والوصول لا يمكن أن تكونا الموقع نفسه.');
    }

    const [origin, destination, regions] = await Promise.all([
      this.prisma.serviceLocation.findUnique({ where: { id: dto.originId } }),
      this.prisma.serviceLocation.findUnique({ where: { id: dto.destinationId } }),
      this.resolveRegions(dto.requiredRegionCodes)
    ]);
    if (!origin || !destination) throw new NotFoundException('أحد موقعي المسار غير موجود.');

    const route = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceRoute.create({
        data: {
          code: this.normalizeCode(dto.code),
          nameAr: dto.nameAr.trim(),
          nameEn: dto.nameEn?.trim() || null,
          originId: dto.originId,
          destinationId: dto.destinationId,
          routeType: dto.routeType,
          requiresFlightDetails: dto.requiresFlightDetails ?? false,
          estimatedMinutes: dto.estimatedMinutes,
          distanceKm: dto.distanceKm,
          isActive: dto.isActive ?? true,
          requiredRegions: {
            create: regions.map((region) => ({ regionId: region.id }))
          }
        },
        include: routeInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_route.create',
          entityType: 'ServiceRoute',
          entityId: created.id,
          metadata: {
            code: created.code,
            originId: created.originId,
            destinationId: created.destinationId,
            requiredRegionCodes: regions.map((region) => region.code)
          }
        }
      });
      return created;
    });

    return this.serializeRoute(route, false);
  }

  async updateRoute(actor: AuthUser, id: string, dto: UpdateRouteDto) {
    const current = await this.prisma.serviceRoute.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('المسار غير موجود.');

    const originId = dto.originId ?? current.originId;
    const destinationId = dto.destinationId ?? current.destinationId;
    if (originId === destinationId) {
      throw new BadRequestException('نقطة الانطلاق والوصول لا يمكن أن تكونا الموقع نفسه.');
    }

    const [origin, destination, regions] = await Promise.all([
      this.prisma.serviceLocation.findUnique({ where: { id: originId } }),
      this.prisma.serviceLocation.findUnique({ where: { id: destinationId } }),
      dto.requiredRegionCodes
        ? this.resolveRegions(dto.requiredRegionCodes)
        : Promise.resolve(null)
    ]);
    if (!origin || !destination) throw new NotFoundException('أحد موقعي المسار غير موجود.');

    const route = await this.prisma.$transaction(async (tx) => {
      if (regions) {
        await tx.routeRequiredRegion.deleteMany({ where: { routeId: id } });
      }

      const updated = await tx.serviceRoute.update({
        where: { id },
        data: {
          ...(dto.code ? { code: this.normalizeCode(dto.code) } : {}),
          ...(dto.nameAr ? { nameAr: dto.nameAr.trim() } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() || null } : {}),
          ...(dto.originId ? { originId: dto.originId } : {}),
          ...(dto.destinationId ? { destinationId: dto.destinationId } : {}),
          ...(dto.routeType ? { routeType: dto.routeType } : {}),
          ...(dto.requiresFlightDetails !== undefined
            ? { requiresFlightDetails: dto.requiresFlightDetails }
            : {}),
          ...(dto.estimatedMinutes !== undefined
            ? { estimatedMinutes: dto.estimatedMinutes }
            : {}),
          ...(dto.distanceKm !== undefined ? { distanceKm: dto.distanceKm } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(regions
            ? {
                requiredRegions: {
                  create: regions.map((region) => ({ regionId: region.id }))
                }
              }
            : {})
        },
        include: routeInclude
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'service_route.update',
          entityType: 'ServiceRoute',
          entityId: id,
          metadata: {
            code: updated.code,
            requiredRegionCodes: regions?.map((region) => region.code) ?? null
          }
        }
      });
      return updated;
    });

    return this.serializeRoute(route, false);
  }

  async setRouteActive(actor: AuthUser, id: string, isActive: boolean) {
    const route = await this.prisma.serviceRoute.update({
      where: { id },
      data: { isActive },
      include: routeInclude
    }).catch(() => null);
    if (!route) throw new NotFoundException('المسار غير موجود.');

    await this.audit(actor, 'service_route.status.update', 'ServiceRoute', id, {
      isActive
    });
    return this.serializeRoute(route, false);
  }

  async eligibleDrivers(routeId: string, query: EligibleDriversQueryDto) {
    const route = await this.prisma.serviceRoute.findUnique({
      where: { id: routeId },
      include: {
        requiredRegions: { select: { regionId: true } }
      }
    });
    if (!route || !route.isActive) throw new NotFoundException('المسار غير موجود أو غير فعال.');

    const travelDate = new Date(query.travelDate);
    if (Number.isNaN(travelDate.getTime())) {
      throw new BadRequestException('تاريخ الرحلة غير صالح.');
    }

    const requiredRegionIds = route.requiredRegions.map((entry) => entry.regionId);
    const vehicleClass = query.vehicleClass ?? VehicleClass.SMALL;
    const classConfig = await this.prisma.vehicleClassConfig.findUnique({
      where: { vehicleClass }
    });
    const minimumCapacity = minimumVehicleCapacity(
      vehicleClass,
      query.passengerCount,
      classConfig?.passengerCapacity
    );
    const requirements = await this.compliance.requirementsForRegions(
      this.prisma,
      requiredRegionIds
    );
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        status: 'APPROVED',
        ...(query.includeOffline ? {} : { availability: 'ONLINE' }),
        user: { status: 'ACTIVE' },
        ...(query.baseRegionCode
          ? { baseRegion: { code: this.normalizeCode(query.baseRegionCode) } }
          : {}),
        vehicles: {
          some: {
            isActive: true,
            seatCapacity: { gte: minimumCapacity },
            ...(query.baseRegionCode
              ? { baseRegion: { code: this.normalizeCode(query.baseRegionCode) } }
              : {})
          }
        }
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }],
      take: 300,
      include: {
        baseRegion: true,
        regionAccesses: { include: { region: true } },
        documents: {
          select: { documentType: true, regionId: true, status: true, expiresAt: true }
        },
        vehicles: {
          where: {
            isActive: true,
            seatCapacity: { gte: minimumCapacity },
            ...(query.baseRegionCode
              ? { baseRegion: { code: this.normalizeCode(query.baseRegionCode) } }
              : {})
          },
          orderBy: [{ year: 'desc' }, { seatCapacity: 'desc' }],
          include: {
            baseRegion: true,
            regionAccesses: { include: { region: true } },
            documents: {
              select: { documentType: true, regionId: true, status: true, expiresAt: true }
            },
            images: {
              where: { isApproved: true },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }]
            }
          }
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            driverTrips: {
              where: { status: 'COMPLETED' },
              select: { id: true }
            }
          }
        }
      }
    });

    const { gte, lt } = this.dayBounds(travelDate);
    const conflicts = await this.prisma.serviceRun.findMany({
      where: {
        driverId: { in: profiles.map((profile) => profile.userId) },
        travelDate: { gte, lt },
        status: { in: ACTIVE_RUN_STATUSES }
      },
      select: { driverId: true, runReference: true }
    });
    const conflictByDriver = new Map(conflicts.map((item) => [item.driverId, item.runReference]));

    return profiles
      .map((profile) => {
        const driverEligible = this.hasAllRegions(
          profile.regionAccesses,
          requiredRegionIds,
          travelDate
        );
        const driverCompliance = this.compliance.evaluateDocuments(
          profile.documents,
          requirements,
          'DRIVER',
          travelDate
        );
        if (!driverEligible || !driverCompliance.eligible) return null;

        const vehicles = profile.vehicles
          .map((vehicle) => ({
            vehicle,
            compliance: this.compliance.evaluateDocuments(
              vehicle.documents,
              requirements,
              'VEHICLE',
              travelDate
            )
          }))
          .filter(
            ({ vehicle, compliance }) =>
              compliance.eligible &&
              this.hasAllRegions(vehicle.regionAccesses, requiredRegionIds, travelDate)
          );
        if (vehicles.length === 0) return null;

        const conflictReference = conflictByDriver.get(profile.userId) ?? null;
        return {
          driverId: profile.userId,
          driverProfileId: profile.id,
          displayName: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
          phone: profile.user.phone,
          avatarUrl: profile.avatarUrl,
          rating: profile.rating,
          completedTrips: profile.user.driverTrips.length,
          availability: profile.availability,
          baseRegion: profile.baseRegion,
          requiredRegionsSatisfied: true,
          hasScheduleConflict: Boolean(conflictReference),
          conflictRunReference: conflictReference,
          compliance: { eligible: true, missing: [] },
          vehicles: vehicles.map(({ vehicle, compliance }) => ({
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            color: vehicle.color,
            plateNumber: vehicle.plateNumber,
            seatCapacity: vehicle.seatCapacity,
            baseRegion: vehicle.baseRegion,
            primaryImageUrl:
              vehicle.primaryImageUrl ??
              vehicle.images.find((image) => image.isPrimary)?.url ??
              vehicle.images[0]?.url ??
              null,
            images: vehicle.images.map((image) => image.url),
            compliance,
            regions: vehicle.regionAccesses.map((entry) => ({
              code: entry.region.code,
              nameAr: entry.region.nameAr,
              status: entry.status,
              validUntil: entry.validUntil
            }))
          }))
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  private async resolveRegions(codes: string[]) {
    const normalized = Array.from(new Set(codes.map((code) => this.normalizeCode(code))));
    if (normalized.length === 0) {
      throw new BadRequestException('يجب تحديد منطقة تشغيل واحدة على الأقل.');
    }

    const regions = await this.prisma.serviceRegion.findMany({
      where: { code: { in: normalized }, kind: 'COUNTRY_ACCESS', isActive: true },
      select: { id: true, code: true }
    });
    if (regions.length !== normalized.length) {
      const found = new Set(regions.map((region) => region.code));
      const missing = normalized.filter((code) => !found.has(code));
      throw new NotFoundException(`مناطق التشغيل غير موجودة: ${missing.join(', ')}`);
    }
    return regions;
  }

  private hasAllRegions(
    accesses: Array<{
      regionId: string;
      status: string;
      validFrom: Date | null;
      validUntil: Date | null;
    }>,
    requiredRegionIds: string[],
    at: Date
  ) {
    const eligible = new Set(
      accesses
        .filter(
          (entry) =>
            entry.status === 'APPROVED' &&
            (!entry.validFrom || entry.validFrom <= at) &&
            (!entry.validUntil || entry.validUntil >= at)
        )
        .map((entry) => entry.regionId)
    );
    return requiredRegionIds.every((regionId) => eligible.has(regionId));
  }

  private serializeRoute<TRoute extends {
    pricingRules: Array<{
      id: string;
      isActive: boolean;
      bookingType: string;
      vehicleClass: string;
      passengerPrice: unknown;
      currency: string;
    }>;
  }>(
    route: TRoute,
    publicView: boolean,
    vehicleClasses: readonly VehicleClassCapacity[] = DEFAULT_VEHICLE_CLASS_CONFIGS
  ) {
    const activeRules = route.pricingRules.filter((rule) => rule.isActive);
    const pricingRules = publicView
      ? activeRules.map((rule) => ({
          id: rule.id,
          bookingType: rule.bookingType,
          vehicleClass: rule.vehicleClass,
          passengerPrice: rule.passengerPrice,
          currency: rule.currency
        }))
      : route.pricingRules;
    return {
      ...route,
      pricingRules,
      bookingTypes: Array.from(new Set(activeRules.map((rule) => rule.bookingType))),
      bookable: activeRules.length > 0,
      vehicleClasses
    };
  }

  private async vehicleClassConfigs(): Promise<VehicleClassCapacity[]> {
    const configs = await this.prisma.vehicleClassConfig.findMany();
    const byClass = new Map(configs.map((config) => [config.vehicleClass, config]));

    return DEFAULT_VEHICLE_CLASS_CONFIGS.map((fallback) => ({
      vehicleClass: fallback.vehicleClass,
      passengerCapacity:
        byClass.get(fallback.vehicleClass)?.passengerCapacity ?? fallback.passengerCapacity
    }));
  }

  private dayBounds(value: Date) {
    const gte = new Date(value);
    gte.setHours(0, 0, 0, 0);
    const lt = new Date(gte);
    lt.setDate(lt.getDate() + 1);
    return { gte, lt };
  }

  private normalizeCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
  }

  private audit(
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action,
        entityType,
        entityId,
        metadata
      }
    });
  }
}
