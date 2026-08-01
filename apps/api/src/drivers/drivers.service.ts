import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { DriverAvailability } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_TRIP_STATUSES = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS'
] as const;

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(user: AuthUser) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub },
      include: {
        vehicles: {
          where: { isActive: true },
          orderBy: { year: 'desc' }
        }
      }
    });

    if (!profile) {
      throw new NotFoundException('ملف السائق غير موجود.');
    }

    return profile;
  }

  async setAvailability(
    user: AuthUser,
    requestedAvailability: DriverAvailability
  ) {
    if (requestedAvailability === DriverAvailability.ON_TRIP) {
      throw new ForbiddenException('لا يمكن اختيار حالة ON_TRIP يدويًا.');
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub }
    });

    if (!profile) {
      throw new NotFoundException('ملف السائق غير موجود.');
    }

    if (profile.status !== 'APPROVED') {
      throw new ForbiddenException('يجب اعتماد حساب السائق أولًا.');
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId: user.sub,
        status: { in: [...ACTIVE_TRIP_STATUSES] }
      },
      select: { id: true }
    });

    if (activeTrip) {
      throw new ConflictException(
        'لا يمكن تغيير حالة الاتصال أثناء وجود رحلة نشطة.'
      );
    }

    const updated = await this.prisma.driverProfile.update({
      where: { userId: user.sub },
      data: { availability: requestedAvailability }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'driver.availability.update',
        entityType: 'DriverProfile',
        entityId: updated.id,
        metadata: {
          from: profile.availability,
          to: requestedAvailability
        }
      }
    });

    return updated;
  }
}
