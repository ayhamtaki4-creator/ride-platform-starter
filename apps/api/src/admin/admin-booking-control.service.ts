import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingModificationService } from '../bookings/booking-modification.service';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AdminUpdateBookingDto } from './dto/admin-update-booking.dto';

@Injectable()
export class AdminBookingControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
    private readonly bookingModifications: BookingModificationService
  ) {}

  async update(actor: AuthUser, tripId: string, dto: AdminUpdateBookingDto) {
    // This endpoint is kept for backwards compatibility with the existing
    // administration detail page. All editable operational fields now pass
    // through the same guarded reschedule/update workflow as the new endpoint.
    // estimatedFare/currency are intentionally ignored here: pricing is derived
    // from the active route + vehicle-class rule and cannot bypass validation.
    return this.bookingModifications.updateAdmin(actor, tripId, {
      ...(dto.contactName !== undefined ? { passengerName: dto.contactName } : {}),
      ...(dto.contactPhone !== undefined ? { passengerPhone: dto.contactPhone } : {}),
      ...(dto.travelDate !== undefined ? { travelDate: dto.travelDate } : {}),
      ...(dto.flightArrivalTime !== undefined
        ? { flightArrivalTime: dto.flightArrivalTime || null }
        : {}),
      ...(dto.flightNumber !== undefined ? { flightNumber: dto.flightNumber || null } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
      ...(dto.passengerCount !== undefined ? { passengerCount: dto.passengerCount } : {}),
      ...(dto.luggageCount !== undefined ? { luggageCount: dto.luggageCount } : {}),
      ...(dto.vehicleClass !== undefined ? { vehicleClass: dto.vehicleClass } : {}),
      changeNote: 'تعديل من شاشة تفاصيل الحجز في الإدارة'
    });
  }

  async acceptDriverOnBehalf(actor: AuthUser, tripId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip?.bookingReference) throw new NotFoundException('الحجز غير موجود.');
      if (!trip.driverId) throw new ConflictException('لم يتم تعيين سائق لهذا الحجز.');
      if (trip.status !== 'DRIVER_ASSIGNED' || trip.driverAssignmentStatus !== 'PENDING') {
        throw new ConflictException('موافقة السائق ليست معلقة في حالة الحجز الحالية.');
      }

      const result = await tx.trip.updateMany({
        where: {
          id: tripId,
          driverId: trip.driverId,
          status: 'DRIVER_ASSIGNED',
          driverAssignmentStatus: 'PENDING'
        },
        data: {
          driverAssignmentStatus: 'ACCEPTED',
          driverRespondedAt: new Date(),
          acceptedAt: new Date(),
          driverRejectionReason: null
        }
      });
      if (result.count !== 1) {
        throw new ConflictException('تغير الحجز. أعد تحميل الصفحة.');
      }

      if (trip.serviceRunId) {
        const pendingCount = await tx.trip.count({
          where: {
            serviceRunId: trip.serviceRunId,
            driverAssignmentStatus: 'PENDING'
          }
        });
        await tx.serviceRun.update({
          where: { id: trip.serviceRunId },
          data: { status: pendingCount === 0 ? 'DRIVER_ACCEPTED' : 'DRIVER_PENDING' }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.assignment.accept_on_behalf',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            bookingReference: trip.bookingReference,
            driverId: trip.driverId,
            serviceRunId: trip.serviceRunId
          }
        }
      });

      return tx.trip.findUniqueOrThrow({ where: { id: tripId } });
    });

    this.realtime.bookingUpdated({
      tripId: updated.id,
      passengerId: updated.passengerId,
      driverId: updated.driverId,
      status: updated.status,
      bookingStatus: updated.bookingReviewStatus,
      bookingReference: updated.bookingReference,
      occurredAt: new Date().toISOString(),
      reason: 'Driver assignment accepted by administration'
    });

    return updated;
  }
}
