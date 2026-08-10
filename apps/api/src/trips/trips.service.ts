import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, Trip, TripStatus } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { EstimateTripDto } from './dto/estimate-trip.dto';
import { TripStateMachine } from './trip-state-machine';

const ACTIVE_PASSENGER_TRIP_STATUSES: TripStatus[] = [
  'PENDING_DISPATCH',
  'SEARCHING_DRIVER',
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

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

    const trip = await this.prisma.trip.create({
      data: {
        passengerId: user.sub,
        status: 'PENDING_DISPATCH',
        pickupAddress: dto.pickupAddress.trim(),
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        dropoffAddress: dto.dropoffAddress.trim(),
        dropoffLatitude: dto.dropoffLatitude,
        dropoffLongitude: dto.dropoffLongitude,
        estimatedDistanceKm: estimate.estimatedDistanceKm,
        estimatedDurationMinutes: estimate.estimatedDurationMinutes,
        estimatedFare: estimate.estimatedFare,
        statusHistory: {
          create: {
            to: 'PENDING_DISPATCH',
            actorId: user.sub,
            note: 'Trip requested and sent to dispatch'
          }
        }
      },
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } }
      }
    });

    await this.audit(user.sub, 'trip.create', trip.id, {
      ...estimate,
      dispatchMode: 'ADMIN'
    });

    this.realtime.tripCreated(this.toRealtimeEvent(trip));

    return this.sanitizeTrip(trip);
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
            lastName: true,
            phone: true
          }
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
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
                    plateNumber: true,
                    seatCapacity: true
                  }
                }
              }
            }
          }
        },
        serviceRun: {
          include: {
            vehicle: {
              select: {
                make: true,
                model: true,
                color: true,
                plateNumber: true,
                seatCapacity: true
              }
            },
            bookings: {
              orderBy: { requestedAt: 'asc' },
              select: {
                id: true,
                bookingReference: true,
                passengerCount: true,
                luggageCount: true,
                contactName: true,
                contactPhone: true,
                driverAssignmentStatus: true
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
            email: true,
            phone: true
          }
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
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
                    plateNumber: true,
                    seatCapacity: true
                  }
                }
              }
            }
          }
        },
        serviceRun: {
          include: {
            vehicle: {
              select: {
                make: true,
                model: true,
                color: true,
                plateNumber: true,
                seatCapacity: true
              }
            },
            bookings: {
              orderBy: { requestedAt: 'asc' },
              select: {
                id: true,
                bookingReference: true,
                passengerCount: true,
                luggageCount: true,
                contactName: true,
                contactPhone: true,
                driverAssignmentStatus: true
              }
            }
          }
        }
      }
    });

    return trips.map((trip) => this.sanitizeTrip(trip));
  }

  async driverTransition(user: AuthUser, id: string, to: TripStatus) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    if (
      trip.status === 'DRIVER_ASSIGNED' &&
      trip.driverAssignmentStatus !== 'ACCEPTED'
    ) {
      throw new ConflictException(
        'يجب قبول المهمة المجدولة قبل بدء تنفيذها.'
      );
    }

    return this.transition(user.sub, trip, to);
  }

  async start(user: AuthUser, id: string) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    if (trip.driverAssignmentStatus !== 'ACCEPTED') {
      throw new ConflictException('يجب قبول المهمة قبل بدء الرحلة.');
    }

    const startedAt = new Date();
    return this.transition(user.sub, trip, 'IN_PROGRESS', {
      startedAt,
      ...(trip.serviceRunId
        ? {
            serviceRunPassengerStatus: 'PICKED_UP',
            pickedUpAt: startedAt
          }
        : {})
    });
  }

  async complete(user: AuthUser, id: string, note?: string) {
    const trip = await this.findTrip(id);
    this.assertDriverOwnsTrip(user, trip.driverId);

    const completedAt = new Date();
    return this.transition(
      user.sub,
      trip,
      'COMPLETED',
      {
        completedAt,
        finalFare: trip.estimatedFare,
        ...(trip.serviceRunId
          ? {
              serviceRunPassengerStatus: 'DROPPED_OFF',
              droppedOffAt: completedAt
            }
          : {})
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

    const updated = await this.prisma.$transaction(async (tx) => {
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

      if (trip.driverId && to === 'DRIVER_ARRIVING') {
        await tx.driverProfile.updateMany({
          where: {
            userId: trip.driverId,
            status: 'APPROVED'
          },
          data: { availability: 'ON_TRIP' }
        });
      }

      if (trip.serviceRunId && to === 'IN_PROGRESS') {
        await tx.serviceRun.updateMany({
          where: { id: trip.serviceRunId },
          data: { status: 'IN_PROGRESS', startedAt: new Date() }
        });
      }

      if (
        trip.serviceRunId &&
        [
          'CANCELLED_BY_PASSENGER',
          'CANCELLED_BY_DRIVER',
          'PASSENGER_NO_SHOW',
          'DRIVER_NO_SHOW'
        ].includes(to)
      ) {
        const run = await tx.serviceRun.findUnique({
          where: { id: trip.serviceRunId }
        });

        if (run) {
          await tx.serviceRun.update({
            where: { id: run.id },
            data: {
              reservedSeats: Math.max(
                0,
                run.reservedSeats - trip.passengerCount
              )
            }
          });
        }
      }

      if (trip.driverId && DRIVER_RELEASE_STATUSES.includes(to)) {
        const remainingDriverTrips = await tx.trip.count({
          where: {
            id: { not: trip.id },
            driverId: trip.driverId,
            status: {
              in: [
                'DRIVER_ARRIVING',
                'DRIVER_ARRIVED',
                'IN_PROGRESS'
              ]
            }
          }
        });

        if (remainingDriverTrips === 0) {
          await tx.driverProfile.updateMany({
            where: {
              userId: trip.driverId,
              status: 'APPROVED'
            },
            data: { availability: 'ONLINE' }
          });
        }

        if (trip.serviceRunId) {
          const remainingRunBookings = await tx.trip.count({
            where: {
              id: { not: trip.id },
              serviceRunId: trip.serviceRunId,
              status: {
                in: [
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_ARRIVED',
                  'IN_PROGRESS'
                ]
              }
            }
          });

          if (remainingRunBookings === 0) {
            await tx.serviceRun.updateMany({
              where: { id: trip.serviceRunId },
              data:
                to === 'COMPLETED'
                  ? { status: 'COMPLETED', completedAt: new Date() }
                  : { status: 'CANCELLED' }
            });
          }
        }
      }

      return tx.trip.findUniqueOrThrow({
        where: { id: trip.id },
        include: {
          statusHistory: { orderBy: { createdAt: 'asc' } }
        }
      });
    });

    this.realtime.tripUpdated(this.toRealtimeEvent(updated));

    if (trip.driverId && to === 'DRIVER_ARRIVING') {
      this.realtime.driverAvailabilityUpdated({
        driverId: trip.driverId,
        availability: 'ON_TRIP',
        occurredAt: new Date().toISOString()
      });
    }

    if (trip.driverId && DRIVER_RELEASE_STATUSES.includes(to)) {
      const remainingDriverTrips = await this.prisma.trip.count({
        where: {
          id: { not: trip.id },
          driverId: trip.driverId,
          status: {
            in: ['DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS']
          }
        }
      });

      if (remainingDriverTrips === 0) {
        this.realtime.driverAvailabilityUpdated({
          driverId: trip.driverId,
          availability: 'ONLINE',
          occurredAt: new Date().toISOString()
        });
      }
    }

    return this.sanitizeTrip(updated);
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

  private sanitizeTrip<T extends { startPinHash: string | null }>(
    trip: T
  ): Omit<T, 'startPinHash'> {
    const { startPinHash: _hidden, ...safeTrip } = trip;
    return safeTrip;
  }

  private toRealtimeEvent(
    trip: Pick<Trip, 'id' | 'passengerId' | 'driverId' | 'status'>
  ) {
    return {
      tripId: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
      occurredAt: new Date().toISOString()
    };
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