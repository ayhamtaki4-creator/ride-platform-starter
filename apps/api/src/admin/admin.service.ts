import { AuthUser } from '../iam/auth-user.type';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { UpdateBookingDto } from './dto/update-booking.dto';

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
      if (!trip.driverId) throw new NotFoundException('لا يوجد سائق معين للحجز.');
      if (trip.status !== 'DRIVER_ASSIGNED' || trip.driverAssignmentStatus !== 'PENDING') {
        throw new NotFoundException('لا يمكن قبول هذه المهمة في حالتها الحالية.');
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

      if (result.count !== 1) throw new NotFoundException('تغير الحجز. أعد تحميل الصفحة.');

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

    this.realtime.tripUpdated({ tripId: updated.id, passengerId: updated.passengerId, driverId: updated.driverId, status: updated.status, bookingStatus: (updated as any).bookingReviewStatus ?? null, bookingReference: (updated as any).bookingReference ?? null, occurredAt: new Date().toISOString() });

    // @ts-ignore
    return (this as any).sanitizeTrip ? (this as any).sanitizeTrip(updated) : updated;
  }

  async updateBooking(actor: AuthUser, id: string, dto: UpdateBookingDto) {
    const booking = await this.prisma.trip.findUnique({ where: { id } });
    if (!booking || !booking.bookingReference) {
      throw new NotFoundException('الحجز غير موجود.');
    }

    const data: Record<string, any> = {};
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.source !== undefined) data.source = dto.source;

    const updated = await this.prisma.trip.update({
      where: { id },
      data,
      include: {
        route: { include: { origin: true, destination: true } },
        passenger: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        pricingRule: true,
        serviceRun: {
          include: {
            route: { include: { origin: true, destination: true } },
            vehicle: { include: { baseRegion: true, images: true } },
            bookings: { orderBy: { requestedAt: 'asc' }, select: { id: true, bookingReference: true, passengerCount: true, luggageCount: true, contactName: true, contactPhone: true, driverAssignmentStatus: true, status: true } }
          }
        },
        flightTicketMedia: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, metadata: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'booking.update.admin',
        entityType: 'Trip',
        entityId: id,
        metadata: {
          updatedFields: Object.keys(dto).filter((k) => (dto as any)[k] !== undefined)
        }
      }
    });

    this.realtime.bookingUpdated({
      tripId: updated.id,
      passengerId: updated.passengerId,
      driverId: updated.driverId,
      status: updated.status,
      bookingStatus: (updated as any).bookingReviewStatus ?? null,
      bookingReference: (updated as any).bookingReference ?? null,
      occurredAt: new Date().toISOString(),
      reason: 'Updated by admin'
    });

    // @ts-ignore
    return (this as any).sanitizeTrip ? (this as any).sanitizeTrip(updated) : updated;
  }
}
