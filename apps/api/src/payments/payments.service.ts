import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  PaymentMethod,
  PaymentReceiver,
  PaymentStatus,
  Prisma
} from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { UpdateCashPaymentDto } from './dto/update-cash-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService
  ) {}

  async updateCashPayment(
    actor: AuthUser,
    tripId: string,
    dto: UpdateCashPaymentDto
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: tripId, bookingReference: { not: null } }
      });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (trip.status !== 'COMPLETED') {
        throw new ConflictException('يمكن تسجيل التحصيل بعد اكتمال الرحلة فقط.');
      }

      const totalFare = new Prisma.Decimal(trip.finalFare ?? trip.estimatedFare);
      if (totalFare.lte(0)) {
        throw new ConflictException('قيمة الحجز النهائية غير صالحة للتحصيل.');
      }

      const amountPaid = new Prisma.Decimal(dto.amountPaid).toDecimalPlaces(3);
      if (amountPaid.gt(totalFare)) {
        throw new ConflictException('المبلغ المستلم لا يمكن أن يتجاوز قيمة الحجز.');
      }

      const paymentStatus: PaymentStatus = amountPaid.eq(0)
        ? PaymentStatus.UNPAID
        : amountPaid.lt(totalFare)
          ? PaymentStatus.PARTIALLY_PAID
          : PaymentStatus.PAID;
      const receivedAt = amountPaid.gt(0) ? new Date() : null;
      const note = dto.note?.trim() || null;

      const result = await tx.trip.updateMany({
        where: {
          id: trip.id,
          paymentStatus: trip.paymentStatus,
          amountPaid: trip.amountPaid
        },
        data: {
          paymentStatus,
          amountPaid,
          paymentMethod: amountPaid.gt(0) ? PaymentMethod.CASH : null,
          paymentReceiver: amountPaid.gt(0) ? dto.receiver : null,
          paymentReceivedAt: receivedAt,
          paymentNote: note
        }
      });

      if (result.count !== 1) {
        throw new ConflictException('تغيرت بيانات الدفع. أعد تحميل الحجز ثم حاول مجددًا.');
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'booking.payment.cash.update',
          entityType: 'Trip',
          entityId: trip.id,
          metadata: {
            bookingReference: trip.bookingReference,
            currency: trip.currency,
            totalFare: totalFare.toFixed(3),
            previousAmountPaid: trip.amountPaid.toFixed(3),
            amountPaid: amountPaid.toFixed(3),
            previousStatus: trip.paymentStatus,
            paymentStatus,
            receiver: amountPaid.gt(0) ? dto.receiver : null,
            note
          }
        }
      });

      return tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
    });

    this.emitBookingUpdate(updated, 'Cash payment updated by administration');
    return this.sanitize(updated);
  }

  async driverReceivedCash(user: AuthUser, tripId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: { id: tripId, bookingReference: { not: null } }
      });

      if (!trip) throw new NotFoundException('الحجز غير موجود.');
      if (trip.driverId !== user.sub) {
        throw new ForbiddenException('الحجز غير معيّن لهذا السائق.');
      }
      if (trip.status !== 'COMPLETED') {
        throw new ConflictException('يمكن تأكيد استلام المبلغ بعد إنهاء الرحلة فقط.');
      }

      if (
        trip.paymentStatus === PaymentStatus.PAID &&
        trip.paymentReceiver === PaymentReceiver.DRIVER
      ) {
        return trip;
      }

      if (!trip.amountPaid.eq(0)) {
        throw new ConflictException(
          'يوجد مبلغ مسجل مسبقًا لهذا الحجز. اطلب من الإدارة مراجعة التحصيل.'
        );
      }

      const totalFare = new Prisma.Decimal(trip.finalFare ?? trip.estimatedFare);
      if (totalFare.lte(0)) {
        throw new ConflictException('قيمة الحجز النهائية غير صالحة للتحصيل.');
      }

      const receivedAt = new Date();
      const result = await tx.trip.updateMany({
        where: {
          id: trip.id,
          driverId: user.sub,
          status: 'COMPLETED',
          paymentStatus: PaymentStatus.UNPAID,
          amountPaid: new Prisma.Decimal(0)
        },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.CASH,
          paymentReceiver: PaymentReceiver.DRIVER,
          amountPaid: totalFare,
          paymentReceivedAt: receivedAt,
          paymentNote: 'Cash received by driver'
        }
      });

      if (result.count !== 1) {
        throw new ConflictException('تغيرت بيانات الدفع. أعد تحميل الحجز ثم حاول مجددًا.');
      }

      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: 'booking.payment.cash.received_by_driver',
          entityType: 'Trip',
          entityId: trip.id,
          metadata: {
            bookingReference: trip.bookingReference,
            amountPaid: totalFare.toFixed(3),
            currency: trip.currency,
            receiver: PaymentReceiver.DRIVER
          }
        }
      });

      return tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
    });

    this.emitBookingUpdate(updated, 'Cash payment received by driver');
    return this.sanitize(updated);
  }

  private emitBookingUpdate(
    trip: {
      id: string;
      passengerId: string;
      driverId: string | null;
      status: string;
      bookingReviewStatus: string;
      bookingReference: string | null;
    },
    reason: string
  ) {
    this.realtime.bookingUpdated({
      tripId: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
      bookingStatus: trip.bookingReviewStatus,
      bookingReference: trip.bookingReference,
      occurredAt: new Date().toISOString(),
      reason
    });
  }

  private sanitize<T extends { startPinHash: string | null }>(
    trip: T
  ): Omit<T, 'startPinHash'> {
    const { startPinHash: _hidden, ...safe } = trip;
    return safe;
  }
}
