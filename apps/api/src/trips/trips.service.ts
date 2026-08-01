import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { randomInt } from 'crypto';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripStateMachine } from './trip-state-machine';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateTripDto) {
    const pin = String(randomInt(1000, 10000));

    const trip = await this.prisma.trip.create({
      data: {
        passengerId: user.sub,
        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        dropoffAddress: dto.dropoffAddress,
        dropoffLatitude: dto.dropoffLatitude,
        dropoffLongitude: dto.dropoffLongitude,
        estimatedFare: dto.estimatedFare,
        startPin: pin,
        statusHistory: {
          create: {
            to: 'SEARCHING_DRIVER',
            actorId: user.sub,
            note: 'Trip requested'
          }
        }
      }
    });

    await this.audit(user.sub, 'trip.create', trip.id);
    return trip;
  }

  mine(user: AuthUser) {
    const isDriver = user.roles.includes('DRIVER');

    return this.prisma.trip.findMany({
      where: isDriver
        ? { driverId: user.sub }
        : { passengerId: user.sub },
      orderBy: { requestedAt: 'desc' },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } }
    });
  }

  async accept(user: AuthUser, id: string) {
    const trip = await this.findTrip(id);

    if (trip.status !== 'SEARCHING_DRIVER') {
      throw new ConflictException('الرحلة لم تعد متاحة.');
    }

    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub }
    });

    if (!driver || driver.status !== 'APPROVED') {
      throw new ForbiddenException('يجب اعتماد حساب السائق أولًا.');
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId: user.sub,
        status: {
          in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS']
        }
      }
    });

    if (activeTrip) {
      throw new ConflictException('لدى السائق رحلة نشطة بالفعل.');
    }

    TripStateMachine.assertTransition(trip.status, 'DRIVER_ASSIGNED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.updateMany({
        where: { id, status: 'SEARCHING_DRIVER', driverId: null },
        data: {
          driverId: user.sub,
          status: 'DRIVER_ASSIGNED',
          acceptedAt: new Date()
        }
      });

      if (updated.count !== 1) {
        throw new ConflictException('قبل سائق آخر الرحلة.');
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId: id,
          from: trip.status,
          to: 'DRIVER_ASSIGNED',
          actorId: user.sub
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'trip.accept',
          entityType: 'Trip',
          entityId: id
        }
      });

      return tx.trip.findUniqueOrThrow({ where: { id } });
    });
  }

  async driverTransition(user: AuthUser, id: string, to: TripStatus) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);
    return this.transition(user.sub, id, trip.status, to);
  }

  async start(user: AuthUser, id: string, pin: string) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    if (trip.startPin !== pin) {
      throw new ForbiddenException('رمز بدء الرحلة غير صحيح.');
    }

    return this.transition(user.sub, id, trip.status, 'IN_PROGRESS', {
      startedAt: new Date()
    });
  }

  async complete(user: AuthUser, id: string, note?: string) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    return this.transition(user.sub, id, trip.status, 'COMPLETED', {
      completedAt: new Date()
    }, note);
  }

  async cancel(user: AuthUser, id: string, note?: string) {
    const trip = await this.findTrip(id);
    const isPassenger = trip.passengerId === user.sub;
    const isDriver = trip.driverId === user.sub;

    if (!isPassenger && !isDriver) {
      throw new ForbiddenException('لا يمكنك إلغاء هذه الرحلة.');
    }

    const to: TripStatus = isPassenger
      ? 'CANCELLED_BY_PASSENGER'
      : 'CANCELLED_BY_DRIVER';

    return this.transition(user.sub, id, trip.status, to, {
      cancelledAt: new Date()
    }, note);
  }

  private async transition(
    actorId: string,
    id: string,
    from: TripStatus,
    to: TripStatus,
    extraData: Prisma.TripUpdateManyMutationInput = {},
    note?: string
  ) {
    TripStateMachine.assertTransition(from, to);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.trip.updateMany({
        where: { id, status: from },
        data: { status: to, ...extraData }
      });

      if (result.count !== 1) {
        throw new ConflictException('تغيرت حالة الرحلة. أعد المحاولة.');
      }

      await tx.tripStatusHistory.create({
        data: { tripId: id, from, to, actorId, note }
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: `trip.status.${to.toLowerCase()}`,
          entityType: 'Trip',
          entityId: id,
          metadata: { from, to, note }
        }
      });

      return tx.trip.findUniqueOrThrow({ where: { id } });
    });
  }

  private async findTrip(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة.');
    return trip;
  }

  private assertDriverOwnsTrip(user: AuthUser, driverId: string | null) {
    if (driverId !== user.sub) {
      throw new ForbiddenException('الرحلة غير مسندة إلى هذا السائق.');
    }
  }

  private audit(actorId: string, action: string, entityId: string) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entityType: 'Trip', entityId }
    });
  }
}
