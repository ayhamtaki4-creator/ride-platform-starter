import {
  BadRequestException,
  Injectable,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DEVICES_PER_USER = 6;
const MAX_DELIVERY_FAILURES = 5;
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
export class MobilePushService {
  private readonly logger = new Logger(MobilePushService.name);
  private readonly account?: FirebaseServiceAccount;
  private accessToken?: { value: string; expiresAtMs: number };

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

  async sendToUser(userId: string, payload: MobilePushPayload) {
    if (!this.account) return;

    const devices = await this.prisma.mobilePushDevice.findMany({
      where: {
        userId,
        failureCount: { lt: MAX_DELIVERY_FAILURES }
      },
      select: { id: true, token: true }
    });
    if (devices.length === 0) return;

    await Promise.allSettled(
      devices.map((device) => this.sendToDevice(device.id, device.token, payload))
    );
  }

  private async sendToDevice(
    id: string,
    token: string,
    payload: MobilePushPayload
  ) {
    try {
      const accessToken = await this.getAccessToken();
      const account = this.account;
      if (!account) return;

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
        return;
      }

      const body = await response.text();
      if (
        response.status === 404 ||
        body.includes('UNREGISTERED') ||
        body.includes('registration-token-not-registered')
      ) {
        await this.prisma.mobilePushDevice.deleteMany({ where: { id } });
        return;
      }

      await this.prisma.mobilePushDevice.updateMany({
        where: { id },
        data: { failureCount: { increment: 1 } }
      });
      this.logger.warn(`FCM delivery failed with ${response.status}: ${body.slice(0, 500)}`);
    } catch (error) {
      await this.prisma.mobilePushDevice.updateMany({
        where: { id },
        data: { failureCount: { increment: 1 } }
      });
      this.logger.warn(
        `FCM delivery failed: ${error instanceof Error ? error.message : String(error)}`
      );
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
