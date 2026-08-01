import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, Trip, TripStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { EstimateTripDto } from './dto/estimate-trip.dto';
import { TripStateMachine } from './trip-state-machine';

const ACTIVE_PASSENGER_TRIP_STATUSES: TripStatus[] = [
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS'
];

const ACTIVE_DRIVER_TRIP_STATUSES: TripStatus[] = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS'
];

const DRIVER_RELEASE_STATUSES: TripStatus[] = [
  'COMPLETED',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'PASSENGER_NO_SHOW',
  'DRIVER_NO_SHOW'
];

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  estimate(dto: EstimateTripDto) {
    const straightLineKm = this.haversineKm(
      dto.pickupLatitude,
      dto.pickupLongitude,
      dto.dropoffLatitude,
      dto.dropoffLongitude
    );

    const estimatedDistanceKm = Number(
      Math.max(0.5, straightLineKm * 1.25).toFixed(2)
    );
    const estimatedDurationMinutes = Math.max(
      5,
      Math.ceil((estimatedDistanceKm / 30) * 60 + 3)
    );

    const baseFare = 2000;
    const distanceFare = estimatedDistanceKm * 1000;
    const timeFare = estimatedDurationMinutes * 100;
    const estimatedFare =
      Math.ceil(
        Math.max(4000, baseFare + distanceFare + timeFare) / 250
      ) * 250;

    return {
      estimatedDistanceKm,
      estimatedDurationMinutes,
      estimatedFare,
      currency: 'IQD'
    };
  }

  async create(user: AuthUser, dto: CreateTripDto) {
    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        passengerId: user.sub,
        status: { in: ACTIVE_PASSENGER_TRIP_STATUSES }
      },
      select: { id: true, status: true }
    });

    if (activeTrip) {
      throw new ConflictException('لديك رحلة نشطة بالفعل.');
    }

    const estimate = this.estimate(dto);
    const startPin = String(randomInt(1000, 10000));
    const startPinHash = await bcrypt.hash(startPin, 10);

    const trip = await this.prisma.trip.create({
      data: {
        passengerId: user.sub,
        pickupAddress: dto.pickupAddress.trim(),
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        dropoffAddress: dto.dropoffAddress.trim(),
        dropoffLatitude: dto.dropoffLatitude,
        dropoffLongitude: dto.dropoffLongitude,
        estimatedDistanceKm: estimate.estimatedDistanceKm,
        estimatedDurationMinutes: estimate.estimatedDurationMinutes,
        estimatedFare: estimate.estimatedFare,
        startPinHash,
        statusHistory: {
          create: {
            to: 'SEARCHING_DRIVER',
            actorId: user.sub,
            note: 'Trip requested'
          }
        }
      },
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } }
      }
    });

    await this.audit(user.sub, 'trip.create', trip.id, estimate);

    return {
      ...this.sanitizeTrip(trip),
      startPin
    };
  }

  async mine(user: AuthUser) {
    const isDriver = user.roles.includes('DRIVER');

    const trips = await this.prisma.trip.findMany({
      where: isDriver ? { driverId: user.sub } : { passengerId: user.sub },
      orderBy: { requestedAt: 'desc' },
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } },
        passenger: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            driverProfile: {
              select: {
                rating: true,
                vehicles: {
                  where: { isActive: true },
                  take: 1,
                  select: {
                    make: true,
                    model: true,
                    color: true,
                    plateNumber: true
                  }
                }
              }
            }
          }
        }
      }
    });

    return trips.map((trip) => this.sanitizeTrip(trip));
  }

  async all() {
    const trips = await this.prisma.trip.findMany({
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } },
        passenger: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return trips.map((trip) => this.sanitizeTrip(trip));
  }

  async available(user: AuthUser) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub }
    });

    if (!driver || driver.status !== 'APPROVED') {
      throw new ForbiddenException('يجب اعتماد حساب السائق أولًا.');
    }

    if (driver.availability !== 'ONLINE') {
      throw new ForbiddenException('يجب أن تكون متصلًا لرؤية الرحلات المتاحة.');
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId: user.sub,
        status: { in: ACTIVE_DRIVER_TRIP_STATUSES }
      },
      select: { id: true }
    });

    if (activeTrip) {
      return [];
    }

    return this.prisma.trip.findMany({
      where: { status: 'SEARCHING_DRIVER', driverId: null },
      orderBy: { requestedAt: 'asc' },
      take: 50,
      select: {
        id: true,
        status: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        estimatedDistanceKm: true,
        estimatedDurationMinutes: true,
        estimatedFare: true,
        currency: true,
        requestedAt: true,
        passenger: {
          select: {
            firstName: true,
            passengerProfile: { select: { rating: true } }
          }
        }
      }
    });
  }

  async rotateStartPin(user: AuthUser, id: string) {
    const trip = await this.findTrip(id);

    if (trip.passengerId !== user.sub) {
      throw new ForbiddenException('لا يمكنك إدارة رمز هذه الرحلة.');
    }

    if (
      !['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED'].includes(
        trip.status
      )
    ) {
      throw new ConflictException(
        'يمكن إنشاء رمز جديد بعد إسناد سائق وقبل بدء الرحلة.'
      );
    }

    const startPin = String(randomInt(1000, 10000));
    const startPinHash = await bcrypt.hash(startPin, 10);

    await this.prisma.trip.update({
      where: { id },
      data: { startPinHash }
    });

    await this.audit(user.sub, 'trip.pin.rotate', id);

    return { tripId: id, startPin };
  }

  async accept(user: AuthUser, id: string) {
    const trip = await this.findTrip(id);

    if (trip.status !== 'SEARCHING_DRIVER') {
      throw new ConflictException('الرحلة لم تعد متاحة.');
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId: user.sub,
        status: { in: ACTIVE_DRIVER_TRIP_STATUSES }
      },
      select: { id: true }
    });

    if (activeTrip) {
      throw new ConflictException('لدى السائق رحلة نشطة بالفعل.');
    }

    TripStateMachine.assertTransition(trip.status, 'DRIVER_ASSIGNED');

    return this.prisma.$transaction(async (tx) => {
      const driverLock = await tx.driverProfile.updateMany({
        where: {
          userId: user.sub,
          status: 'APPROVED',
          availability: 'ONLINE'
        },
        data: { availability: 'ON_TRIP' }
      });

      if (driverLock.count !== 1) {
        throw new ConflictException(
          'يجب أن يكون السائق معتمدًا ومتصلًا لقبول الرحلة.'
        );
      }

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

      const accepted = await tx.trip.findUniqueOrThrow({ where: { id } });
      return this.sanitizeTrip(accepted);
    });
  }

  async driverTransition(user: AuthUser, id: string, to: TripStatus) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);
    return this.transition(user.sub, trip, to);
  }

  async start(user: AuthUser, id: string, pin: string) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    const isValidPin = await bcrypt.compare(pin, trip.startPinHash);
    if (!isValidPin) {
      throw new ForbiddenException('رمز بدء الرحلة غير صحيح.');
    }

    return this.transition(user.sub, trip, 'IN_PROGRESS', {
      startedAt: new Date()
    });
  }

  async complete(user: AuthUser, id: string, note?: string) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    return this.transition(
      user.sub,
      trip,
      'COMPLETED',
      {
        completedAt: new Date(),
        finalFare: trip.estimatedFare
      },
      note
    );
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

    return this.transition(
      user.sub,
      trip,
      to,
      { cancelledAt: new Date() },
      note
    );
  }

  private async transition(
    actorId: string,
    trip: Trip,
    to: TripStatus,
    extraData: Prisma.TripUpdateManyMutationInput = {},
    note?: string
  ) {
    TripStateMachine.assertTransition(trip.status, to);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.trip.updateMany({
        where: { id: trip.id, status: trip.status },
        data: { ...extraData, status: to }
      });

      if (result.count !== 1) {
        throw new ConflictException('تغيرت حالة الرحلة. أعد المحاولة.');
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId: trip.id,
          from: trip.status,
          to,
          actorId,
          note
        }
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: `trip.status.${to.toLowerCase()}`,
          entityType: 'Trip',
          entityId: trip.id,
          metadata: { from: trip.status, to, note }
        }
      });

      if (trip.driverId && DRIVER_RELEASE_STATUSES.includes(to)) {
        await tx.driverProfile.updateMany({
          where: {
            userId: trip.driverId,
            status: 'APPROVED'
          },
          data: { availability: 'ONLINE' }
        });
      }

      const updated = await tx.trip.findUniqueOrThrow({
        where: { id: trip.id },
        include: {
          statusHistory: { orderBy: { createdAt: 'asc' } }
        }
      });

      return this.sanitizeTrip(updated);
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

  private sanitizeTrip<T extends { startPinHash: string }>(
    trip: T
  ): Omit<T, 'startPinHash'> {
    const { startPinHash: _hidden, ...safeTrip } = trip;
    return safeTrip;
  }

  private audit(
    actorId: string,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'Trip',
        entityId,
        metadata
      }
    });
  }

  private haversineKm(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number
  ) {
    const earthRadiusKm = 6371;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const latitudeDelta = toRadians(latitude2 - latitude1);
    const longitudeDelta = toRadians(longitude2 - longitude1);
    const firstLatitude = toRadians(latitude1);
    const secondLatitude = toRadians(latitude2);

    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
