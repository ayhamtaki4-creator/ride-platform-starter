import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingDriverContactService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPassenger(user: AuthUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        passengerId: true,
        driverAssignmentStatus: true,
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        }
      }
    });

    if (!trip) throw new NotFoundException('الحجز غير موجود.');
    if (trip.passengerId !== user.sub) {
      throw new ForbiddenException('لا يمكنك عرض بيانات سائق هذا الحجز.');
    }

    const assigned = ['PENDING', 'ACCEPTED'].includes(trip.driverAssignmentStatus);
    if (!assigned || !trip.driver) {
      return { assigned: false, driver: null };
    }

    return {
      assigned: true,
      driver: {
        id: trip.driver.id,
        displayName: `${trip.driver.firstName} ${trip.driver.lastName}`.trim(),
        phone: trip.driver.phone
      }
    };
  }
}
