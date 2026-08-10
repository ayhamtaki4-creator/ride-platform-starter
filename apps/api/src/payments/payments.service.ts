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
  Prisma,
  Trip
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateDriverSettlementDto } from './dto/create-driver-settlement.dto';
import { UpdateCashPaymentDto } from './dto/update-cash-payment.dto';

type DriverBalanceRow = {
  driverId: string;
  currency: string;
  balance: Prisma.Decimal | string | number;
  lastEntryAt: Date | null;
};

type DriverTripStatsRow = {
  driverId: string;
  currency: string;
  completedTrips: bigint | number;
  driverFees: Prisma.Decimal | string | number;
  platformMargins: Prisma.Decimal | string | number;
  collectedByDriver: Prisma.Decimal | string | number;
  collectedByAdmin: Prisma.Decimal | string | number;
};

type LedgerEntryRow = {
  id: string;
  tripId: string | null;
  type: 'TRIP_POSITION' | 'SETTLEMENT_TO_DRIVER' | 'SETTLEMENT_TO_PLATFORM';
  balanceDelta: Prisma.Decimal | string | number;
  currency: string;
  note: string | null;
  createdAt: Date;
  bookingReference: string | null;
};

type SettlementRow = {
  id: string;
  direction: 'TO_DRIVER' | 'TO_PLATFORM';
  amount: Prisma.Decimal | string | number;
  currency: string;
  note: string | null;
  settledAt: Date;
  createdAt: Date;
};

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

      const current = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      const ledgerDelta = await this.syncTripDriverPosition(tx, current, actor.sub);

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
            driverBalanceDelta: ledgerDelta.toFixed(3),
            note
          }
        }
      });

      return current;
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
        await this.syncTripDriverPosition(tx, trip, user.sub);
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

      const current = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      const ledgerDelta = await this.syncTripDriverPosition(tx, current, user.sub);

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
            receiver: PaymentReceiver.DRIVER,
            driverBalanceDelta: ledgerDelta.toFixed(3)
          }
        }
      });

      return current;
    });

    this.emitBookingUpdate(updated, 'Cash payment received by driver');
    return this.sanitize(updated);
  }

  async adminDriverFinanceSummary() {
    const [drivers, balanceRows, tripStats] = await Promise.all([
      this.prisma.user.findMany({
        where: { driverProfile: { isNot: null } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          driverProfile: {
            select: { status: true, rating: true }
          }
        }
      }),
      this.prisma.$queryRaw<DriverBalanceRow[]>(Prisma.sql`
        SELECT
          "driverId",
          "currency",
          COALESCE(SUM("balanceDelta"), 0) AS "balance",
          MAX("createdAt") AS "lastEntryAt"
        FROM "DriverLedgerEntry"
        GROUP BY "driverId", "currency"
      `),
      this.prisma.$queryRaw<DriverTripStatsRow[]>(Prisma.sql`
        SELECT
          "driverId",
          "currency",
          COUNT(*) FILTER (WHERE "status" = 'COMPLETED'::"TripStatus") AS "completedTrips",
          COALESCE(SUM("driverFee") FILTER (WHERE "status" = 'COMPLETED'::"TripStatus"), 0) AS "driverFees",
          COALESCE(SUM("platformMargin") FILTER (WHERE "status" = 'COMPLETED'::"TripStatus"), 0) AS "platformMargins",
          COALESCE(SUM("amountPaid") FILTER (
            WHERE "paymentStatus" = 'PAID'::"PaymentStatus"
              AND "paymentReceiver" = 'DRIVER'::"PaymentReceiver"
          ), 0) AS "collectedByDriver",
          COALESCE(SUM("amountPaid") FILTER (
            WHERE "paymentStatus" = 'PAID'::"PaymentStatus"
              AND "paymentReceiver" = 'ADMIN'::"PaymentReceiver"
          ), 0) AS "collectedByAdmin"
        FROM "Trip"
        WHERE "driverId" IS NOT NULL
        GROUP BY "driverId", "currency"
      `)
    ]);

    const balances = new Map(
      balanceRows.map((row) => [this.financeKey(row.driverId, row.currency), row])
    );
    const stats = new Map(
      tripStats.map((row) => [this.financeKey(row.driverId, row.currency), row])
    );

    const items = drivers.flatMap((driver) => {
      const currencies = new Set<string>(['USD']);
      for (const row of balanceRows) if (row.driverId === driver.id) currencies.add(row.currency);
      for (const row of tripStats) if (row.driverId === driver.id) currencies.add(row.currency);

      return [...currencies].map((currency) => {
        const balanceRow = balances.get(this.financeKey(driver.id, currency));
        const tripRow = stats.get(this.financeKey(driver.id, currency));
        const balance = this.decimal(balanceRow?.balance ?? 0);

        return {
          driverId: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          driverStatus: driver.driverProfile?.status ?? null,
          rating: driver.driverProfile?.rating ?? null,
          currency,
          balance: balance.toFixed(3),
          balanceDirection: this.balanceDirection(balance),
          completedTrips: Number(tripRow?.completedTrips ?? 0),
          driverFees: this.decimal(tripRow?.driverFees ?? 0).toFixed(3),
          platformMargins: this.decimal(tripRow?.platformMargins ?? 0).toFixed(3),
          collectedByDriver: this.decimal(tripRow?.collectedByDriver ?? 0).toFixed(3),
          collectedByAdmin: this.decimal(tripRow?.collectedByAdmin ?? 0).toFixed(3),
          lastEntryAt: balanceRow?.lastEntryAt ?? null
        };
      });
    });

    items.sort((left, right) => Math.abs(Number(right.balance)) - Math.abs(Number(left.balance)));

    const totals = [...new Set(items.map((item) => item.currency))].map((currency) => {
      const rows = items.filter((item) => item.currency === currency);
      const net = rows.reduce((sum, row) => sum.plus(row.balance), new Prisma.Decimal(0));
      const platformOwesDrivers = rows.reduce(
        (sum, row) => Number(row.balance) > 0 ? sum.plus(row.balance) : sum,
        new Prisma.Decimal(0)
      );
      const driversOwePlatform = rows.reduce(
        (sum, row) => Number(row.balance) < 0 ? sum.plus(this.decimal(row.balance).abs()) : sum,
        new Prisma.Decimal(0)
      );

      return {
        currency,
        netBalance: net.toFixed(3),
        platformOwesDrivers: platformOwesDrivers.toFixed(3),
        driversOwePlatform: driversOwePlatform.toFixed(3)
      };
    });

    return { totals, items };
  }

  async driverFinanceDetail(driverId: string) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        driverProfile: {
          select: { status: true, rating: true }
        }
      }
    });

    if (!driver?.driverProfile) {
      throw new NotFoundException('السائق غير موجود.');
    }

    const [balances, entries, settlements] = await Promise.all([
      this.prisma.$queryRaw<DriverBalanceRow[]>(Prisma.sql`
        SELECT
          "driverId",
          "currency",
          COALESCE(SUM("balanceDelta"), 0) AS "balance",
          MAX("createdAt") AS "lastEntryAt"
        FROM "DriverLedgerEntry"
        WHERE "driverId" = ${driverId}::uuid
        GROUP BY "driverId", "currency"
        ORDER BY "currency"
      `),
      this.prisma.$queryRaw<LedgerEntryRow[]>(Prisma.sql`
        SELECT
          e."id",
          e."tripId",
          e."type",
          e."balanceDelta",
          e."currency",
          e."note",
          e."createdAt",
          t."bookingReference"
        FROM "DriverLedgerEntry" e
        LEFT JOIN "Trip" t ON t."id" = e."tripId"
        WHERE e."driverId" = ${driverId}::uuid
        ORDER BY e."createdAt" DESC
        LIMIT 100
      `),
      this.prisma.$queryRaw<SettlementRow[]>(Prisma.sql`
        SELECT
          "id",
          "direction",
          "amount",
          "currency",
          "note",
          "settledAt",
          "createdAt"
        FROM "DriverSettlement"
        WHERE "driverId" = ${driverId}::uuid
        ORDER BY "settledAt" DESC
        LIMIT 100
      `)
    ]);

    const normalizedBalances = balances.length
      ? balances.map((row) => {
          const balance = this.decimal(row.balance);
          return {
            currency: row.currency,
            balance: balance.toFixed(3),
            balanceDirection: this.balanceDirection(balance),
            lastEntryAt: row.lastEntryAt
          };
        })
      : [{ currency: 'USD', balance: '0.000', balanceDirection: 'SETTLED' as const, lastEntryAt: null }];

    return {
      driver,
      balances: normalizedBalances,
      entries: entries.map((entry) => ({
        ...entry,
        balanceDelta: this.decimal(entry.balanceDelta).toFixed(3)
      })),
      settlements: settlements.map((settlement) => ({
        ...settlement,
        amount: this.decimal(settlement.amount).toFixed(3)
      }))
    };
  }

  driverFinanceForSelf(user: AuthUser) {
    return this.driverFinanceDetail(user.sub);
  }

  async createDriverSettlement(
    actor: AuthUser,
    driverId: string,
    dto: CreateDriverSettlementDto
  ) {
    const currency = (dto.currency ?? 'USD').trim().toUpperCase();
    const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(3);
    const note = dto.note?.trim() || null;

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${driverId}::uuid
        FOR UPDATE
      `);

      if (!locked.length) throw new NotFoundException('السائق غير موجود.');

      const profile = await tx.driverProfile.findUnique({
        where: { userId: driverId },
        select: { userId: true }
      });
      if (!profile) throw new NotFoundException('السائق غير موجود.');

      const balance = await this.driverBalance(tx, driverId, currency);
      if (balance.eq(0)) {
        throw new ConflictException('لا يوجد رصيد مفتوح يحتاج إلى تسوية.');
      }
      if (amount.gt(balance.abs())) {
        throw new ConflictException('مبلغ التسوية أكبر من الرصيد المفتوح للسائق.');
      }

      const platformOwesDriver = balance.gt(0);
      const direction = platformOwesDriver ? 'TO_DRIVER' : 'TO_PLATFORM';
      const ledgerType = platformOwesDriver
        ? 'SETTLEMENT_TO_DRIVER'
        : 'SETTLEMENT_TO_PLATFORM';
      const balanceDelta = platformOwesDriver ? amount.negated() : amount;
      const ledgerEntryId = randomUUID();
      const settlementId = randomUUID();
      const settledAt = new Date();

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DriverLedgerEntry" (
          "id", "driverId", "type", "balanceDelta", "currency",
          "sourceKey", "note", "createdById", "createdAt"
        ) VALUES (
          ${ledgerEntryId}::uuid,
          ${driverId}::uuid,
          ${ledgerType},
          CAST(${balanceDelta.toFixed(3)} AS DECIMAL(12,3)),
          ${currency},
          ${`settlement:${settlementId}`},
          ${note},
          ${actor.sub}::uuid,
          ${settledAt}
        )
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DriverSettlement" (
          "id", "driverId", "direction", "amount", "currency",
          "note", "settledAt", "createdById", "ledgerEntryId", "createdAt"
        ) VALUES (
          ${settlementId}::uuid,
          ${driverId}::uuid,
          ${direction},
          CAST(${amount.toFixed(3)} AS DECIMAL(12,3)),
          ${currency},
          ${note},
          ${settledAt},
          ${actor.sub}::uuid,
          ${ledgerEntryId}::uuid,
          ${settledAt}
        )
      `);

      const newBalance = balance.plus(balanceDelta).toDecimalPlaces(3);

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.finance.settlement.create',
          entityType: 'DriverSettlement',
          entityId: settlementId,
          metadata: {
            driverId,
            direction,
            amount: amount.toFixed(3),
            currency,
            previousBalance: balance.toFixed(3),
            balanceDelta: balanceDelta.toFixed(3),
            newBalance: newBalance.toFixed(3),
            note
          }
        }
      });

      await tx.notification.create({
        data: {
          userId: driverId,
          type: 'DRIVER_FINANCIAL_SETTLEMENT',
          title: 'تم تسجيل تسوية مالية',
          message: platformOwesDriver
            ? `تم تسجيل دفعة لك بقيمة ${amount.toFixed(3)} ${currency}.`
            : `تم تسجيل تسليمك للمنصة مبلغ ${amount.toFixed(3)} ${currency}.`,
          entityType: 'DriverSettlement',
          entityId: settlementId,
          link: '/driver'
        }
      });

      return {
        id: settlementId,
        driverId,
        direction,
        amount: amount.toFixed(3),
        currency,
        note,
        settledAt,
        previousBalance: balance.toFixed(3),
        newBalance: newBalance.toFixed(3),
        balanceDirection: this.balanceDirection(newBalance)
      };
    });

    return result;
  }

  private async syncTripDriverPosition(
    tx: Prisma.TransactionClient,
    trip: Trip,
    actorId: string
  ) {
    if (!trip.driverId) return new Prisma.Decimal(0);

    const current = await this.tripAccountedPosition(tx, trip.id, trip.driverId);
    const target = this.tripTargetPosition(trip);
    const delta = target.minus(current).toDecimalPlaces(3);

    if (delta.eq(0)) return delta;

    const note = trip.paymentStatus === PaymentStatus.PAID
      ? trip.paymentReceiver === PaymentReceiver.ADMIN
        ? 'Platform collected fare; driver fee became payable'
        : 'Driver collected fare; platform margin became receivable'
      : 'Payment state changed; previous driver position reversed';

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "DriverLedgerEntry" (
        "id", "driverId", "tripId", "type", "balanceDelta",
        "currency", "note", "createdById", "createdAt"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${trip.driverId}::uuid,
        ${trip.id}::uuid,
        'TRIP_POSITION',
        CAST(${delta.toFixed(3)} AS DECIMAL(12,3)),
        ${trip.currency},
        ${note},
        ${actorId}::uuid,
        ${new Date()}
      )
    `);

    return delta;
  }

  private tripTargetPosition(trip: Trip) {
    if (
      trip.paymentStatus !== PaymentStatus.PAID ||
      !trip.paymentReceiver ||
      !trip.driverId
    ) {
      return new Prisma.Decimal(0);
    }

    return trip.paymentReceiver === PaymentReceiver.ADMIN
      ? new Prisma.Decimal(trip.driverFee).toDecimalPlaces(3)
      : new Prisma.Decimal(trip.platformMargin).negated().toDecimalPlaces(3);
  }

  private async tripAccountedPosition(
    tx: Prisma.TransactionClient,
    tripId: string,
    driverId: string
  ) {
    const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal | string | number }>>(Prisma.sql`
      SELECT COALESCE(SUM("balanceDelta"), 0) AS "balance"
      FROM "DriverLedgerEntry"
      WHERE "tripId" = ${tripId}::uuid
        AND "driverId" = ${driverId}::uuid
        AND "type" = 'TRIP_POSITION'
    `);
    return this.decimal(rows[0]?.balance ?? 0);
  }

  private async driverBalance(
    tx: Prisma.TransactionClient,
    driverId: string,
    currency: string
  ) {
    const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal | string | number }>>(Prisma.sql`
      SELECT COALESCE(SUM("balanceDelta"), 0) AS "balance"
      FROM "DriverLedgerEntry"
      WHERE "driverId" = ${driverId}::uuid
        AND "currency" = ${currency}
    `);
    return this.decimal(rows[0]?.balance ?? 0).toDecimalPlaces(3);
  }

  private balanceDirection(balance: Prisma.Decimal) {
    if (balance.gt(0)) return 'PLATFORM_OWES_DRIVER' as const;
    if (balance.lt(0)) return 'DRIVER_OWES_PLATFORM' as const;
    return 'SETTLED' as const;
  }

  private decimal(value: Prisma.Decimal | string | number | bigint) {
    return new Prisma.Decimal(value.toString());
  }

  private financeKey(driverId: string, currency: string) {
    return `${driverId}:${currency}`;
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
