import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AdminUpdateBookingDto } from './dto/admin-update-booking.dto';

@Injectable()
export class AdminBookingControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async update(actor: AuthUser, tripId: string, dto: AdminUpdateBookingDto) {
    const current = await this.prisma.trip.findFirst({
      where: { id: tripId, bookingReference: { not: null } }
    });
    if (!current) throw new NotFoundException('الحجز غير موجود.');

    const travelDate = dto.travelDate ? new Date(dto.travelDate) : undefined;
    if (travelDate && Number.isNaN(travelDate.getTime())) {
      throw new ConflictException('تاريخ الرحلة غير صحيح.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.update({
        where: { id: tripId },
        data: {
          ...(dto.contactName !== undefined ? { contactName: dto.contactName.trim() } : {}),
          ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone.trim() } : {}),
          ...(travelDate ? { travelDate } : {}),
          ...(dto.flightArrivalTime !== undefined
            ? { flightArrivalTime: dto.flightArrivalTime.trim() || null }
            : {}),
          ...(dto.flightNumber !== undefined
            ? { flightNumber: dto.flightNumber.trim() || null }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          ...(dto.passengerCount !== undefined ? { passengerCount: dto.passengerCount } : {}),
          ...(dto.luggageCount !== undefined ? { luggageCount: dto.luggageCount } : {}),
          ...(dto.vehicleClass !== undefined ? { vehicleClass: dto.vehicleClass } : {}),
          ...(dto.estimatedFare !== undefined
            ? { estimatedFare: new Prisma.Decimal(dto.estimatedFare) }
            : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency.trim().toUpperCase() } : {})
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'booking.admin_override.update',
          entityType: 'Trip',
          entityId: tripId,
          metadata: {
            bookingReference: current.bookingReference,
            changedFields: Object.keys(dto),
            previousFare: String(current.estimatedFare),
            newFare: String(trip.estimatedFare),
            previousTravelDate: current.travelDate?.toISOString() ?? null,
            newTravelDate: trip.travelDate?.toISOString() ?? null
          }
        }
      });

      return trip;
    });

    this.realtime.bookingUpdated({
      tripId: updated.id,
      passengerId: updated.passengerId,
      driverId: updated.driverId,
      status: updated.status,
      bookingStatus: updated.bookingReviewStatus,
      bookingReference: updated.bookingReference,
      occurredAt: new Date().toISOString(),
      reason: 'Booking updated by administration'
    });

    return updated;
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
