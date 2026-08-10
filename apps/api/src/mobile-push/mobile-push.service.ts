import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DEVICES_PER_USER = 6;
const MAX_DELIVERY_FAILURES = 5;
const MAX_PUSH_ATTEMPTS = 4;
const FIREBASE_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type MobilePushPayload = {
  title: string;
  message: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
};

@Injectable()
export class MobilePushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MobilePushService.name);
  private readonly account?: FirebaseServiceAccount;
  private accessToken?: { value: string; expiresAtMs: number };
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService
  ) {
    const raw = (config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '').trim();
    if (!raw) return;

    try {
      const parsed = this.parseServiceAccount(raw);
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error('missing project_id, client_email or private_key');
      }
      this.account = parsed;
    } catch (error) {
      this.logger.error(
        `Firebase mobile push disabled because service account configuration is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  onModuleInit() {
    if (!this.account) return;
    this.timer = setInterval(() => void this.pollNotifications(), 5000);
    this.timer.unref?.();
    void this.pollNotifications();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  clientConfig() {
    return { enabled: Boolean(this.account) };
  }

  async registerDevice(
    userId: string,
    input: {
      token?: string;
      platform?: string;
      deviceId?: string;
      appVersion?: string;
    }
  ) {
    const token = input.token?.trim() ?? '';
    const platform = input.platform?.trim().toUpperCase() ?? '';
    if (token.length < 20 || token.length > 4096) {
      throw new BadRequestException('رمز إشعارات الجهاز غير صالح.');
    }
    if (!['ANDROID', 'IOS'].includes(platform)) {
      throw new BadRequestException('منصة الجهاز غير مدعومة.');
    }

    const device = await this.prisma.mobilePushDevice.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        deviceId: input.deviceId?.trim().slice(0, 200) || null,
        appVersion: input.appVersion?.trim().slice(0, 80) || null,
        lastSeenAt: new Date()
      },
      update: {
        userId,
        platform,
        deviceId: input.deviceId?.trim().slice(0, 200) || null,
        appVersion: input.appVersion?.trim().slice(0, 80) || null,
        failureCount: 0,
        lastSeenAt: new Date()
      },
      select: {
        id: true,
        platform: true,
        deviceId: true,
        appVersion: true,
        lastSeenAt: true
      }
    });

    const overflow = await this.prisma.mobilePushDevice.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true }
    });
    if (overflow.length > 0) {
      await this.prisma.mobilePushDevice.deleteMany({
        where: { id: { in: overflow.map((item) => item.id) } }
      });
    }

    void this.pollNotifications();
    return device;
  }

  async unregisterDevice(userId: string, token?: string) {
    const value = token?.trim() ?? '';
    if (!value) throw new BadRequestException('رمز الجهاز مطلوب.');
    await this.prisma.mobilePushDevice.deleteMany({
      where: { userId, token: value }
    });
    return { deleted: true };
  }

  private async pollNotifications() {
    if (!this.account || this.polling) return;
    this.polling = true;
    try {
      const devices = await this.prisma.mobilePushDevice.findMany({
        where: { failureCount: { lt: MAX_DELIVERY_FAILURES } },
        select: { id: true, userId: true, token: true }
      });
      if (devices.length === 0) return;

      const userIds = Array.from(new Set(devices.map((item) => item.userId)));
      const notifications = await this.prisma.notification.findMany({
        where: {
          userId: { in: userIds },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          message: true,
          entityType: true,
          entityId: true,
          link: true
        }
      });

      for (const notification of notifications) {
        const targets = devices.filter((device) => device.userId === notification.userId);
        for (const device of targets) {
          await this.deliverNotification(device, notification);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Mobile push poll failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.polling = false;
    }
  }

  private async deliverNotification(
    device: { id: string; token: string },
    notification: {
      id: string;
      type: string;
      title: string;
      message: string;
      entityType: string | null;
      entityId: string | null;
      link: string | null;
    }
  ) {
    const key = {
      notificationId_deviceId: {
        notificationId: notification.id,
        deviceId: device.id
      }
    } as const;
    const existing = await this.prisma.mobilePushDelivery.findUnique({
      where: key,
      select: { id: true, status: true, attempts: true }
    });
    if (existing?.status === 'SENT' || (existing?.attempts ?? 0) >= MAX_PUSH_ATTEMPTS) {
      return;
    }

    const delivery = existing ?? await this.prisma.mobilePushDelivery.create({
      data: {
        notificationId: notification.id,
        deviceId: device.id
      },
      select: { id: true, status: true, attempts: true }
    });

    const payload: MobilePushPayload = {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
      link: notification.link
    };

    const result = await this.sendToDevice(device.id, device.token, payload);
    await this.prisma.mobilePushDelivery.updateMany({
      where: { id: delivery.id },
      data: result.ok
        ? {
            status: 'SENT',
            attempts: { increment: 1 },
            deliveredAt: new Date(),
            lastError: null
          }
        : {
            status: 'FAILED',
            attempts: { increment: 1 },
            lastError: result.error?.slice(0, 1000) ?? 'FCM delivery failed'
          }
    });
  }

  private async sendToDevice(
    id: string,
    token: string,
    payload: MobilePushPayload
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      const account = this.account;
      if (!account) return { ok: false, error: 'Firebase disabled' };

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title: payload.title,
                body: payload.message
              },
              data: {
                type: payload.type,
                entityType: payload.entityType ?? '',
                entityId: payload.entityId ?? '',
                link: payload.link ?? ''
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'ride_driver',
                  sound: 'default'
                }
              },
              apns: {
                payload: {
                  aps: {
                    sound: 'default',
                    'content-available': 1
                  }
                }
              }
            }
          })
        }
      );

      if (response.ok) {
        await this.prisma.mobilePushDevice.updateMany({
          where: { id },
          data: { failureCount: 0, lastSeenAt: new Date() }
        });
        return { ok: true };
      }

      const body = await response.text();
      if (
        response.status === 404 ||
        body.includes('UNREGISTERED') ||
        body.includes('registration-token-not-registered')
      ) {
        await this.prisma.mobilePushDevice.deleteMany({ where: { id } });
        return { ok: false, error: 'FCM token is no longer registered' };
      }

      await this.prisma.mobilePushDevice.updateMany({
        where: { id },
        data: { failureCount: { increment: 1 } }
      });
      return { ok: false, error: `FCM ${response.status}: ${body}` };
    } catch (error) {
      await this.prisma.mobilePushDevice.updateMany({
        where: { id },
        data: { failureCount: { increment: 1 } }
      });
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async getAccessToken() {
    const cached = this.accessToken;
    if (cached && cached.expiresAtMs - Date.now() > 60_000) return cached.value;

    const account = this.account;
    if (!account) throw new Error('Firebase mobile push is disabled.');

    const now = Math.floor(Date.now() / 1000);
    const tokenUri = account.token_uri?.trim() || DEFAULT_TOKEN_URI;
    const header = this.base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = this.base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: FIREBASE_SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600
      })
    );
    const unsigned = `${header}.${claims}`;
    const signature = sign('RSA-SHA256', Buffer.from(unsigned), account.private_key)
      .toString('base64url');
    const assertion = `${unsigned}.${signature}`;

    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });
    if (!response.ok) {
      throw new Error(`Firebase OAuth failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) throw new Error('Firebase OAuth returned no access token.');
    const expiresIn = Math.max(300, Number(data.expires_in ?? 3600));
    this.accessToken = {
      value: data.access_token,
      expiresAtMs: Date.now() + expiresIn * 1000
    };
    return data.access_token;
  }

  private parseServiceAccount(raw: string): FirebaseServiceAccount {
    try {
      return JSON.parse(raw) as FirebaseServiceAccount;
    } catch {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as FirebaseServiceAccount;
    }
  }

  private base64Url(value: string) {
    return Buffer.from(value).toString('base64url');
  }
}
