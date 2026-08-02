import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const rules = await this.prisma.pricingRule.findMany({
      where: { isActive: true },
      orderBy: [{ routeId: 'asc' }, { direction: 'asc' }, { bookingType: 'asc' }],
      include: {
        route: { include: { origin: true, destination: true } }
      }
    });

    return rules.map((rule) => ({
      id: rule.id,
      routeId: rule.routeId,
      direction: rule.direction,
      bookingType: rule.bookingType,
      passengerPrice: rule.passengerPrice,
      currency: rule.currency,
      route: rule.route
    }));
  }

  listAll() {
    return this.prisma.pricingRule.findMany({
      orderBy: [{ routeId: 'asc' }, { direction: 'asc' }, { bookingType: 'asc' }],
      include: {
        route: { include: { origin: true, destination: true } }
      }
    });
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
        bookingType: dto.bookingType
      },
      select: { id: true, scopeKey: true }
    });

    const rule = existing
      ? await this.prisma.pricingRule.update({
          where: { id: existing.id },
          data: {
            ...values,
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
