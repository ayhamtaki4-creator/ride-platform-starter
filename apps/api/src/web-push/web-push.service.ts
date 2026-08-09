import {
  BadRequestException,
  Injectable,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  KeyObject,
  sign
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertWebPushSubscriptionDto } from './dto/upsert-web-push-subscription.dto';

const MAX_SUBSCRIPTIONS_PER_USER = 8;
const MAX_DELIVERY_FAILURES = 5;

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly enabled: boolean;
  private readonly publicKey: string;
  private readonly subject: string;
  private readonly signingKey?: KeyObject;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService
  ) {
    const requested = this.booleanEnv(
      config.get<string>('WEB_PUSH_ENABLED'),
      false
    );
    const publicKey = (
      config.get<string>('WEB_PUSH_PUBLIC_KEY') ?? ''
    ).trim();
    const privateKey = (
      config.get<string>('WEB_PUSH_PRIVATE_KEY') ?? ''
    ).trim();
    const subject = (
      config.get<string>('WEB_PUSH_SUBJECT') ?? ''
    ).trim();

    this.publicKey = publicKey;
    this.subject = subject;

    if (!requested) {
      this.enabled = false;
      return;
    }

    try {
      const publicBytes = Buffer.from(publicKey, 'base64url');
      const privateBytes = Buffer.from(privateKey, 'base64url');

      if (
        publicBytes.length !== 65 ||
        publicBytes[0] !== 0x04 ||
        privateBytes.length !== 32
      ) {
        throw new Error('invalid P-256 key length');
      }

      if (!/^(mailto:|https:\/\/)/i.test(subject)) {
        throw new Error('WEB_PUSH_SUBJECT must use mailto: or https://');
      }

      this.signingKey = createPrivateKey({
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: publicBytes.subarray(1, 33).toString('base64url'),
          y: publicBytes.subarray(33, 65).toString('base64url'),
          d: privateBytes.toString('base64url')
        },
        format: 'jwk'
      });
      this.enabled = true;
    } catch (error) {
      this.enabled = false;
      this.logger.error(
        `Web Push disabled because VAPID configuration is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  clientConfig() {
    return {
      enabled: this.enabled,
      publicKey: this.enabled ? this.publicKey : null
    };
  }

  async upsertSubscription(
    userId: string,
    dto: UpsertWebPushSubscriptionDto,
    userAgent?: string
  ) {
    this.assertEnabled();

    const expiresAt = dto.expirationTime
      ? new Date(dto.expirationTime)
      : null;

    const subscription = await this.prisma.webPushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        expiresAt,
        userAgent: userAgent?.slice(0, 512) || null
      },
      update: {
        userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
        expiresAt,
        userAgent: userAgent?.slice(0, 512) || null,
        failureCount: 0
      },
      select: {
        id: true,
        endpoint: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const overflow = await this.prisma.webPushSubscription.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip: MAX_SUBSCRIPTIONS_PER_USER,
      select: { id: true }
    });

    if (overflow.length > 0) {
      await this.prisma.webPushSubscription.deleteMany({
        where: {
          id: { in: overflow.map((item) => item.id) }
        }
      });
    }

    return subscription;
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.prisma.webPushSubscription.deleteMany({
      where: {
        userId,
        endpoint
      }
    });

    return { deleted: true };
  }

  async sendToUser(userId: string) {
    if (!this.enabled || !this.signingKey) return;

    const subscriptions =
      await this.prisma.webPushSubscription.findMany({
        where: {
          userId,
          failureCount: { lt: MAX_DELIVERY_FAILURES },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          id: true,
          endpoint: true
        }
      });

    await Promise.allSettled(
      subscriptions.map((subscription) =>
        this.send(subscription.id, subscription.endpoint)
      )
    );
  }

  private async send(id: string, endpoint: string) {
    try {
      const token = this.vapidToken(endpoint);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `vapid t=${token}, k=${this.publicKey}`,
          TTL: '60',
          Urgency: 'high'
        },
        signal: AbortSignal.timeout(8_000)
      });

      if (response.ok) {
        await this.prisma.webPushSubscription.update({
          where: { id },
          data: {
            lastSuccessAt: new Date(),
            failureCount: 0
          }
        });
        return;
      }

      if (response.status === 404 || response.status === 410) {
        await this.prisma.webPushSubscription.deleteMany({
          where: { id }
        });
        return;
      }

      await this.prisma.webPushSubscription.updateMany({
        where: { id },
        data: {
          failureCount: { increment: 1 }
        }
      });

      const host = new URL(endpoint).host;
      this.logger.warn(
        `Web Push delivery failed for ${host}: HTTP ${response.status}`
      );
    } catch (error) {
      await this.prisma.webPushSubscription
        .updateMany({
          where: { id },
          data: {
            failureCount: { increment: 1 }
          }
        })
        .catch(() => undefined);

      this.logger.warn(
        `Web Push delivery error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private vapidToken(endpoint: string) {
    if (!this.signingKey) {
      throw new Error('VAPID signing key is unavailable');
    }

    const endpointUrl = new URL(endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ typ: 'JWT', alg: 'ES256' })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: now + 12 * 60 * 60,
        sub: this.subject
      })
    ).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = sign(
      'sha256',
      Buffer.from(unsigned),
      {
        key: this.signingKey,
        dsaEncoding: 'ieee-p1363'
      }
    ).toString('base64url');

    return `${unsigned}.${signature}`;
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new BadRequestException(
        'إشعارات الهاتف غير مفعلة على الخادم حاليًا.'
      );
    }
  }

  private booleanEnv(value: string | undefined, fallback: boolean) {
    if (!value) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(
      value.trim().toLowerCase()
    );
  }
}
