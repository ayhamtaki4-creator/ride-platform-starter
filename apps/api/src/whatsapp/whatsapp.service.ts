import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WhatsAppDeliveryStatus } from '@prisma/client';
import { toWhatsAppRecipient } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from '../web-push/web-push.service';

type TemplateParameters = {
  recipientName: string;
  title: string;
  message: string;
  reference: string;
  link: string;
};

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly enabled: boolean;
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly graphVersion: string;
  private readonly templateName: string;
  private readonly languageCode: string;
  private readonly portalUrl: string;
  private readonly queueIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webPush: WebPushService
  ) {
    this.enabled = this.config.get<string>('WHATSAPP_ENABLED') === 'true';
    this.token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN') ?? '';
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    this.graphVersion = this.config.get<string>('WHATSAPP_GRAPH_API_VERSION') ?? 'v25.0';
    this.templateName = this.config.get<string>('WHATSAPP_STATUS_TEMPLATE') ?? 'ride_booking_update';
    this.languageCode = this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'ar';
    this.portalUrl = (
      this.config.get<string>('PORTAL_URL') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    this.queueIntervalMs = Math.max(
      5000,
      Number(this.config.get<string>('WHATSAPP_QUEUE_INTERVAL_MS') ?? '15000') || 15000
    );
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
      graphVersion: this.graphVersion,
      templateName: this.templateName,
      languageCode: this.languageCode
    };
  }

  async list(status?: string) {
    const validStatuses = Object.values(WhatsAppDeliveryStatus);
    const normalized = status?.trim().toUpperCase();
    return this.prisma.whatsAppDelivery.findMany({
      where:
        normalized && validStatuses.includes(normalized as WhatsAppDeliveryStatus)
          ? { status: normalized as WhatsAppDeliveryStatus }
          : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, phone: true }
        },
        notification: {
          select: { type: true, title: true, message: true, link: true }
        }
      }
    });
  }

  async retry(id: string) {
    const delivery = await this.prisma.whatsAppDelivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('سجل إرسال WhatsApp غير موجود.');

    const updated = await this.prisma.whatsAppDelivery.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null
      }
    });
    void this.processQueue();
    return updated;
  }

  async enqueueNotification(notificationId: string) {
    // This is the existing post-notification fan-out hook used by RealtimeEventsService.
    // Web Push is triggered here before WhatsApp-specific opt-in/config checks so users
    // can receive browser notifications even when WhatsApp delivery is disabled.
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            whatsappOptIn: true,
            status: true
          }
        }
      }
    });

    if (!notification || notification.user.status !== 'ACTIVE') {
      return;
    }

    void this.webPush.sendToUser(notification.userId);

    if (
      !this.enabled ||
      !notification.user.whatsappOptIn ||
      !notification.user.phone
    ) {
      return;
    }

    let recipientPhone: string;
    try {
      recipientPhone = toWhatsAppRecipient(notification.user.phone);
    } catch (error) {
      this.logger.warn(
        `WhatsApp skipped for user ${notification.user.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }

    const metadata = this.asRecord(notification.metadata);
    const relativeLink = notification.link ?? '';
    const parameters: TemplateParameters = {
      recipientName:
        `${notification.user.firstName} ${notification.user.lastName}`.trim(),
      title: notification.title,
      message: notification.message,
      reference:
        typeof metadata?.bookingReference === 'string' && metadata.bookingReference
          ? metadata.bookingReference
          : notification.entityId?.slice(0, 8) ?? '—',
      link: relativeLink
        ? `${this.portalUrl}${relativeLink.startsWith('/') ? relativeLink : `/${relativeLink}`}`
        : this.portalUrl
    };

    await this.prisma.whatsAppDelivery.upsert({
      where: { notificationId },
      update: {},
      create: {
        notificationId,
        userId: notification.userId,
        recipientPhone,
        templateName: this.templateName,
        languageCode: this.languageCode,
        parameters: parameters as unknown as Prisma.InputJsonValue,
        status: this.isConfigured() ? 'PENDING' : 'SKIPPED',
        lastError: this.isConfigured()
          ? null
          : 'WHATSAPP_ACCESS_TOKEN أو WHATSAPP_PHONE_NUMBER_ID غير مضبوط.'
      }
    });

    if (this.isConfigured()) void this.processQueue();
  }

  private async processQueue() {
    if (this.processing || !this.enabled || !this.isConfigured()) return;
    this.processing = true;

    try {
      const deliveries = await this.prisma.whatsAppDelivery.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          attempts: { lt: 5 },
          nextAttemptAt: { lte: new Date() }
        },
        orderBy: { createdAt: 'asc' },
        take: 20
      });

      for (const delivery of deliveries) {
        const claimed = await this.prisma.whatsAppDelivery.updateMany({
          where: {
            id: delivery.id,
            status: { in: ['PENDING', 'FAILED'] }
          },
          data: { status: 'SENDING' }
        });
        if (claimed.count !== 1) continue;
        await this.sendDelivery(delivery.id);
      }
    } finally {
      this.processing = false;
    }
  }

  private async sendDelivery(id: string) {
    const delivery = await this.prisma.whatsAppDelivery.findUniqueOrThrow({
      where: { id }
    });
    const parameters = delivery.parameters as unknown as TemplateParameters;

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: delivery.recipientPhone,
            type: 'template',
            template: {
              name: delivery.templateName,
              language: { code: delivery.languageCode },
              components: [
                {
                  type: 'body',
                  parameters: [
                    parameters.recipientName,
                    parameters.title,
                    parameters.message,
                    parameters.reference,
                    parameters.link
                  ].map((text) => ({ type: 'text', text }))
                }
              ]
            }
          }),
          signal: AbortSignal.timeout(15000)
        }
      );
      const body = (await response.json().catch(() => null)) as
        | { messages?: Array<{ id?: string }>; error?: { message?: string } }
        | null;

      if (!response.ok) {
        throw new Error(body?.error?.message || `Meta API HTTP ${response.status}`);
      }

      await this.prisma.whatsAppDelivery.update({
        where: { id },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          providerMessageId: body?.messages?.[0]?.id ?? null,
          lastError: null,
          sentAt: new Date()
        }
      });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const retryMinutes = [1, 5, 15, 60, 240][Math.min(attempts - 1, 4)];
      await this.prisma.whatsAppDelivery.update({
        where: { id },
        data: {
          status: 'FAILED',
          attempts,
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + retryMinutes * 60 * 1000)
        }
      });
      this.logger.warn(`WhatsApp delivery ${id} failed on attempt ${attempts}.`);
    }
  }

  private isConfigured() {
    return Boolean(this.token && this.phoneNumberId && this.templateName);
  }

  private asRecord(value: Prisma.JsonValue | null) {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    return value as Record<string, Prisma.JsonValue>;
  }
}
