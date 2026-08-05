import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TelegramDeliveryStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const bookingSelect = {
  id: true,
  bookingReference: true,
  direction: true,
  bookingType: true,
  travelDate: true,
  flightArrivalTime: true,
  flightNumber: true,
  passengerCount: true,
  luggageCount: true,
  contactName: true,
  contactPhone: true,
  estimatedFare: true,
  currency: true,
  passenger: {
    select: {
      firstName: true,
      lastName: true,
      phone: true
    }
  },
  route: {
    select: {
      nameAr: true,
      origin: { select: { nameAr: true } },
      destination: { select: { nameAr: true } }
    }
  }
} satisfies Prisma.TripSelect;

type TelegramBooking = Prisma.TripGetPayload<{ select: typeof bookingSelect }>;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly enabled: boolean;
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly portalUrl: string;
  private readonly apiBaseUrl: string;
  private readonly queueIntervalMs: number;
  private readonly timeZone: string;
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {
    this.enabled = this.config.get<string>('TELEGRAM_ENABLED') === 'true';
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() ?? '';
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID')?.trim() ?? '';
    this.portalUrl = (
      this.config.get<string>('PORTAL_URL') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    this.apiBaseUrl = (
      this.config.get<string>('TELEGRAM_API_BASE_URL') ??
      'https://api.telegram.org'
    ).replace(/\/$/, '');
    this.queueIntervalMs = Math.max(
      5000,
      Number(this.config.get<string>('TELEGRAM_QUEUE_INTERVAL_MS') ?? '15000') ||
        15000
    );
    this.timeZone = this.config.get<string>('TELEGRAM_TIME_ZONE') ?? 'Asia/Damascus';
  }

  onModuleInit() {
    if (!this.enabled) return;
    void this.processQueue();
    this.timer = setInterval(() => void this.processQueue(), this.queueIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  configurationStatus() {
    return {
      enabled: this.enabled,
      configured: this.isConfigured(),
      botTokenConfigured: Boolean(this.botToken),
      chatIdConfigured: Boolean(this.chatId),
      chatIdHint: this.chatId ? `***${this.chatId.slice(-4)}` : null,
      queueIntervalMs: this.queueIntervalMs
    };
  }

  async list(status?: string) {
    const validStatuses = Object.values(TelegramDeliveryStatus);
    const normalized = status?.trim().toUpperCase();

    return this.prisma.telegramDelivery.findMany({
      where:
        normalized && validStatuses.includes(normalized as TelegramDeliveryStatus)
          ? { status: normalized as TelegramDeliveryStatus }
          : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async enqueueBookingCreated(tripId: string) {
    if (!this.enabled) return;

    try {
      const booking = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: bookingSelect
      });
      if (!booking) {
        this.logger.warn(`Telegram booking alert skipped: trip ${tripId} was not found.`);
        return;
      }

      const buttonUrl = `${this.portalUrl}/admin/bookings/${booking.id}`;
      await this.prisma.telegramDelivery.upsert({
        where: { dedupeKey: `booking-created:${booking.id}` },
        update: {},
        create: {
          tripId: booking.id,
          dedupeKey: `booking-created:${booking.id}`,
          chatId: this.chatId || 'not-configured',
          messageText: this.bookingMessage(booking),
          buttonText: 'فتح تفاصيل الحجز',
          buttonUrl,
          status: this.isConfigured() ? 'PENDING' : 'SKIPPED',
          lastError: this.isConfigured()
            ? null
            : 'TELEGRAM_BOT_TOKEN أو TELEGRAM_CHAT_ID غير مضبوط.'
        }
      });

      if (this.isConfigured()) void this.processQueue();
    } catch (error) {
      this.logger.warn(
        `Telegram booking alert could not be queued for ${tripId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async sendTest() {
    this.assertConfigured();

    const delivery = await this.prisma.telegramDelivery.create({
      data: {
        dedupeKey: `telegram-test:${randomUUID()}`,
        chatId: this.chatId,
        messageText:
          '✅ تم ربط بوت Telegram بنجاح. ستصل إلى هذه المحادثة تنبيهات الحجوزات الجديدة.',
        buttonText: 'فتح الحجوزات',
        buttonUrl: `${this.portalUrl}/admin/bookings`,
        status: 'SENDING'
      }
    });

    await this.sendDelivery(delivery.id);
    return this.prisma.telegramDelivery.findUniqueOrThrow({
      where: { id: delivery.id }
    });
  }

  async retry(id: string) {
    this.assertConfigured();

    const delivery = await this.prisma.telegramDelivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('سجل إرسال Telegram غير موجود.');

    const updated = await this.prisma.telegramDelivery.update({
      where: { id },
      data: {
        chatId: this.chatId,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        providerMessageId: null,
        lastError: null,
        sentAt: null
      }
    });
    void this.processQueue();
    return updated;
  }

  private async processQueue() {
    if (this.processing || !this.enabled || !this.isConfigured()) return;
    this.processing = true;

    try {
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      await this.prisma.telegramDelivery.updateMany({
        where: { status: 'SENDING', updatedAt: { lt: staleBefore } },
        data: {
          status: 'FAILED',
          nextAttemptAt: new Date(),
          lastError: 'توقفت محاولة سابقة قبل اكتمالها، وستتم إعادة الإرسال.'
        }
      });

      const deliveries = await this.prisma.telegramDelivery.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          attempts: { lt: 5 },
          nextAttemptAt: { lte: new Date() }
        },
        orderBy: { createdAt: 'asc' },
        take: 20
      });

      for (const delivery of deliveries) {
        const claimed = await this.prisma.telegramDelivery.updateMany({
          where: {
            id: delivery.id,
            status: { in: ['PENDING', 'FAILED'] },
            attempts: { lt: 5 },
            nextAttemptAt: { lte: new Date() }
          },
          data: { status: 'SENDING' }
        });
        if (claimed.count !== 1) continue;
        await this.sendDelivery(delivery.id);
      }
    } catch (error) {
      this.logger.warn(
        `Telegram queue processing failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.processing = false;
    }
  }

  private async sendDelivery(id: string) {
    const delivery = await this.prisma.telegramDelivery.findUniqueOrThrow({
      where: { id }
    });

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: delivery.chatId,
            text: delivery.messageText,
            link_preview_options: { is_disabled: true },
            ...(delivery.buttonText && delivery.buttonUrl
              ? {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: delivery.buttonText,
                          url: delivery.buttonUrl
                        }
                      ]
                    ]
                  }
                }
              : {})
          }),
          signal: AbortSignal.timeout(15000)
        }
      );
      const body = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            result?: { message_id?: number };
            description?: string;
          }
        | null;

      if (!response.ok || body?.ok !== true) {
        throw new Error(body?.description || `Telegram API HTTP ${response.status}`);
      }

      await this.prisma.telegramDelivery.update({
        where: { id },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          providerMessageId:
            body.result?.message_id === undefined
              ? null
              : String(body.result.message_id),
          lastError: null,
          sentAt: new Date()
        }
      });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const retryMinutes = [1, 5, 15, 60, 240][Math.min(attempts - 1, 4)];
      await this.prisma.telegramDelivery.update({
        where: { id },
        data: {
          status: 'FAILED',
          attempts,
          lastError: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000
          ),
          nextAttemptAt: new Date(Date.now() + retryMinutes * 60 * 1000)
        }
      });
      this.logger.warn(`Telegram delivery ${id} failed on attempt ${attempts}.`);
    }
  }

  private bookingMessage(booking: TelegramBooking) {
    const passengerName =
      booking.contactName?.trim() ||
      `${booking.passenger.firstName} ${booking.passenger.lastName}`.trim();
    const passengerPhone = booking.contactPhone?.trim() || booking.passenger.phone || 'غير مضاف';
    const travelDate = this.formatTravelDate(booking.travelDate);
    const travelTime = booking.flightArrivalTime?.trim()
      ? `${travelDate}، الساعة ${booking.flightArrivalTime.trim()}`
      : travelDate;
    const fare = `${Number(booking.estimatedFare).toLocaleString('ar-SY', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })} ${booking.currency}`;

    return [
      '🚐 حجز جديد على منصة شام روت',
      '',
      `رقم الحجز: ${booking.bookingReference || booking.id.slice(0, 8)}`,
      `المسافر: ${passengerName}`,
      `الهاتف: ${passengerPhone}`,
      `المسار: ${this.routeLabel(booking)}`,
      `موعد الرحلة: ${travelTime}`,
      ...(booking.flightNumber?.trim()
        ? [`رقم الرحلة الجوية: ${booking.flightNumber.trim()}`]
        : []),
      `نوع الحجز: ${this.bookingTypeLabel(booking.bookingType)}`,
      `عدد الركاب: ${booking.passengerCount}`,
      `عدد الحقائب: ${booking.luggageCount}`,
      `السعر: ${fare}`
    ].join('\n');
  }

  private routeLabel(booking: TelegramBooking) {
    if (booking.route) {
      return `من ${booking.route.origin.nameAr} إلى ${booking.route.destination.nameAr}`;
    }
    if (booking.direction === 'BEIRUT_AIRPORT_TO_DAMASCUS') {
      return 'من مطار بيروت إلى دمشق';
    }
    if (booking.direction === 'DAMASCUS_TO_BEIRUT_AIRPORT') {
      return 'من دمشق إلى مطار بيروت';
    }
    return 'غير محدد';
  }

  private bookingTypeLabel(value: TelegramBooking['bookingType']) {
    if (value === 'SHARED_SEAT') return 'مقعد مشترك';
    if (value === 'PRIVATE_CAR') return 'سيارة خاصة';
    return 'غير محدد';
  }

private vehicleClassLabel(value?: string | null) {
  if (!value) return 'غير محدد';
  const labels: Record<string, string> = {
    SMALL: 'صغيرة',
    MEDIUM: 'متوسطة',
    LARGE: 'كبيرة',
  };
  return labels[value] ?? value;
}

  private formatTravelDate(value: Date | null) {
    if (!value) return 'غير محدد';
    try {
      return new Intl.DateTimeFormat('ar-SY', {
        dateStyle: 'full',
        timeZone: this.timeZone
      }).format(value);
    } catch {
      return new Intl.DateTimeFormat('ar-SY', {
        dateStyle: 'full',
        timeZone: 'UTC'
      }).format(value);
    }
  }

  private assertConfigured() {
    if (!this.enabled || !this.isConfigured()) {
      throw new BadRequestException(
        'فعّل Telegram واضبط TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID أولًا.'
      );
    }
  }

  private isConfigured() {
    return Boolean(this.botToken && this.chatId);
  }
}
