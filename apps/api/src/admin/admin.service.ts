import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { TripStateMachine } from '../trips/trip-state-machine';

const PENDING_DISPATCH_STATUSES: TripStatus[] = [
  'PENDING_DISPATCH',
  'SEARCHING_DRIVER'
];

const ACTIVE_DRIVER_TRIP_STATUSES: TripStatus[] = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS'
];

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  auditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  pendingTrips() {
    return this.prisma.trip.findMany({
      where: {
        status: { in: PENDING_DISPATCH_STATUSES },
        driverId: null
      },
      orderBy: { requestedAt: 'asc' },
      take: 100,
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
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            passengerProfile: {
              select: { rating: true }
            }
          }
        }
      }
    });
  }

  async availableDrivers() {
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        status: 'APPROVED',
        availability: 'ONLINE',
        user: { status: 'ACTIVE' },
        vehicles: { some: { isActive: true } }
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }],
      take: 100,
      include: {
        vehicles: {
          where: { isActive: true },
          orderBy: { year: 'desc' },
          take: 1
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

    return profiles.map((profile) => ({
      id: profile.id,
      userId: profile.userId,
      status: profile.status,
      availability: profile.availability,
      rating: profile.rating,
      vehicle: profile.vehicles[0] ?? null,
      user: {
        id: profile.user.id,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        email: profile.user.email,
        phone: profile.user.phone
      },
      completedTrips: profile.user.driverTrips.length
    }));
  }

  async assignDriver(actor: AuthUser, tripId: string, driverId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip) {
        throw new NotFoundException('الرحلة غير موجودة.');
      }

      if (
        trip.driverId ||
        !PENDING_DISPATCH_STATUSES.includes(trip.status)
      ) {
        throw new ConflictException(
          'الطلب لم يعد بانتظار تعيين سائق.'
        );
      }

      TripStateMachine.assertTransition(trip.status, 'DRIVER_ASSIGNED');

      const driver = await tx.driverProfile.findUnique({
        where: { userId: driverId },
        include: {
          user: { select: { status: true } },
          vehicles: {
            where: { isActive: true },
            take: 1,
            select: { id: true }
          }
        }
      });

      if (
        !driver ||
        driver.status !== 'APPROVED' ||
        driver.availability !== 'ONLINE' ||
        driver.user.status !== 'ACTIVE' ||
        driver.vehicles.length === 0
      ) {
        throw new ConflictException(
          'السائق غير متاح أو غير معتمد أو لا يملك مركبة فعالة.'
        );
      }

      const existingTrip = await tx.trip.findFirst({
        where: {
          driverId,
          status: { in: ACTIVE_DRIVER_TRIP_STATUSES }
        },
        select: { id: true }
      });

      if (existingTrip) {
        throw new ConflictException('لدى السائق رحلة نشطة بالفعل.');
      }

      const driverLock = await tx.driverProfile.updateMany({
        where: {
          userId: driverId,
          status: 'APPROVED',
          availability: 'ONLINE'
        },
        data: { availability: 'ON_TRIP' }
      });

      if (driverLock.count !== 1) {
        throw new ConflictException('تغيرت حالة السائق. أعد تحميل القائمة.');
      }

      const tripLock = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: null,
          status: { in: PENDING_DISPATCH_STATUSES }
        },
        data: {
          driverId,
          status: 'DRIVER_ASSIGNED',
          acceptedAt: new Date()
        }
      });

      if (tripLock.count !== 1) {
        throw new ConflictException(
          'تم تعيين هذا الطلب من مشرف آخر.'
        );
      }

      await tx.tripStatusHistory.create({
        data: {
          tripId,
          from: trip.status,
          to: 'DRIVER_ASSIGNED',
          actorId: actor.sub,
          note: `Driver assigned by dispatch: ${driverId}`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'trip.dispatch.assign_driver',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            driverId,
            from: trip.status,
            to: 'DRIVER_ASSIGNED'
          }
        }
      });

      const assigned = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
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
                      plateNumber: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      const { startPinHash: _hidden, ...safeTrip } = assigned;
      return safeTrip;
    });
  }
}
