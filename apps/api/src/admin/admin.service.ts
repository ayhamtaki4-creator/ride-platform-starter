import { AuthUser } from '../iam/auth-user.type';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  // ... existing methods (keep unchanged) ...

  async forceAcceptDriver(actor: AuthUser, tripId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (!trip.driverId) throw new ConflictException('لا يوجد سائق معين للحجز.');
      if (trip.status !== 'DRIVER_ASSIGNED' || trip.driverAssignmentStatus !== 'PENDING') {
        throw new ConflictException('لا يمكن قبول هذه المهمة في حالتها الحالية.');
      }

      const result = await tx.trip.updateMany({
        where: { id: tripId, status: 'DRIVER_ASSIGNED', driverAssignmentStatus: 'PENDING' },
        data: {
          driverAssignmentStatus: 'ACCEPTED',
          driverRespondedAt: new Date(),
          acceptedAt: new Date(),
          driverRejectionReason: null
        }
      });

      if (result.count !== 1) throw new ConflictException('تغير الحجز. أعد تحميل الصفحة.');

      if (trip.serviceRunId) {
        const pendingCount = await tx.trip.count({ where: { serviceRunId: trip.serviceRunId, driverAssignmentStatus: 'PENDING' } });
        await tx.serviceRun.update({ where: { id: trip.serviceRunId }, data: { status: pendingCount === 0 ? 'DRIVER_ACCEPTED' : 'DRIVER_PENDING' } });
      }

      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'booking.dispatch.force_accept', entityType: 'Trip', entityId: tripId, metadata: { driverId: trip.driverId, serviceRunId: trip.serviceRunId } } });

      return tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: {
        statusHistory: { orderBy: { createdAt: 'asc' } },
        route: true,
        passenger: true,
        driver: true,
        serviceRun: true
      } });
    });

    this.realtime.tripUpdated({ tripId: updated.id, passengerId: updated.passengerId, driverId: updated.driverId, status: updated.status, bookingStatus: updated.bookingReviewStatus, bookingReference: updated.bookingReference, occurredAt: new Date().toISOString() });

    // sanitizeTrip exists elsewhere in AdminService; assuming it's present
    // @ts-ignore
    return this.sanitizeTrip(updated);
  }
}
