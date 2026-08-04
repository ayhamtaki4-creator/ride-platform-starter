import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VehicleClass } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';
import { UpdateVehicleClassConfigDto } from './dto/update-vehicle-class-config.dto';
import { DEFAULT_VEHICLE_CLASS_CONFIGS } from './vehicle-class';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const rules = await this.prisma.pricingRule.findMany({
      where: { isActive: true },
      orderBy: [
        { routeId: 'asc' },
        { direction: 'asc' },
        { bookingType: 'asc' },
        { vehicleClass: 'asc' }
      ],
      include: {
        route: { include: { origin: true, destination: true } }
      }
    });

    return rules.map((rule) => ({
      id: rule.id,
      routeId: rule.routeId,
      direction: rule.direction,
      bookingType: rule.bookingType,
      vehicleClass: rule.vehicleClass,
      passengerPrice: rule.passengerPrice,
      currency: rule.currency,
      route: rule.route
    }));
  }

  listAll() {
    return this.prisma.pricingRule.findMany({
      orderBy: [
        { routeId: 'asc' },
        { direction: 'asc' },
        { bookingType: 'asc' },
        { vehicleClass: 'asc' }
      ],
      include: {
        route: { include: { origin: true, destination: true } }
      }
    });
  }

  async listVehicleClassConfigs() {
    const configs = await this.prisma.vehicleClassConfig.findMany();
    const byClass = new Map(configs.map((config) => [config.vehicleClass, config]));

    return DEFAULT_VEHICLE_CLASS_CONFIGS.map((fallback) =>
      byClass.get(fallback.vehicleClass) ?? {
        ...fallback,
        createdAt: null,
        updatedAt: null
      }
    );
  }

  async updateVehicleClassConfig(
    actor: AuthUser,
    vehicleClass: VehicleClass,
    dto: UpdateVehicleClassConfigDto
  ) {
    const config = await this.prisma.vehicleClassConfig.upsert({
      where: { vehicleClass },
      create: { vehicleClass, passengerCapacity: dto.passengerCapacity },
      update: { passengerCapacity: dto.passengerCapacity }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'vehicle_class.capacity.update',
        entityType: 'VehicleClassConfig',
        entityId: vehicleClass,
        metadata: {
          vehicleClass,
          passengerCapacity: config.passengerCapacity
        }
      }
    });

    return config;
  }

  async upsert(actor: AuthUser, dto: UpsertPricingRuleDto) {
    if (Boolean(dto.routeId) === Boolean(dto.direction)) {
      throw new BadRequestException('يجب تحديد routeId أو direction، وليس كليهما.');
    }

    const difference = Math.abs(
      dto.passengerPrice - dto.driverFee - dto.platformMargin
    );
    if (difference > 0.01) {
      throw new BadRequestException(
        'سعر المسافر يجب أن يساوي أجر السائق مضافًا إليه هامش المنصة.'
      );
    }

    if (dto.routeId) {
      const route = await this.prisma.serviceRoute.findUnique({
        where: { id: dto.routeId },
        select: { id: true }
      });
      if (!route) throw new NotFoundException('المسار غير موجود.');
    }

    const values = {
      passengerPrice: dto.passengerPrice,
      driverFee: dto.driverFee,
      platformMargin: dto.platformMargin,
      currency: dto.currency?.trim().toUpperCase() || 'USD',
      isActive: dto.isActive ?? true
    };

    const scopeKey = dto.routeId
      ? `ROUTE:${dto.routeId}`
      : `DIRECTION:${dto.direction!}`;
    const existing = await this.prisma.pricingRule.findFirst({
      where: {
        ...(dto.routeId ? { routeId: dto.routeId } : { direction: dto.direction }),
        bookingType: dto.bookingType,
        vehicleClass: dto.vehicleClass
      },
      select: { id: true, scopeKey: true }
    });

    const rule = existing
      ? await this.prisma.pricingRule.update({
          where: { id: existing.id },
          data: {
            ...values,
            scopeKey,
            vehicleClass: dto.vehicleClass,
            ...(dto.routeId ? { routeId: dto.routeId } : { direction: dto.direction! })
          },
          include: { route: { include: { origin: true, destination: true } } }
        })
      : await this.prisma.pricingRule.create({
          data: {
            scopeKey,
            routeId: dto.routeId ?? null,
            direction: dto.direction ?? null,
            bookingType: dto.bookingType,
            vehicleClass: dto.vehicleClass,
            ...values
          },
          include: { route: { include: { origin: true, destination: true } } }
        });

    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'pricing.upsert',
        entityType: 'PricingRule',
        entityId: rule.id,
        metadata: {
          routeId: rule.routeId,
          direction: rule.direction,
          bookingType: rule.bookingType,
          vehicleClass: rule.vehicleClass,
          passengerPrice: Number(rule.passengerPrice),
          driverFee: Number(rule.driverFee),
          platformMargin: Number(rule.platformMargin),
          currency: rule.currency,
          isActive: rule.isActive
        }
      }
    });

    return rule;
  }
}
