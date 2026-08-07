import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';

@Injectable()
export class R2ObjectStorageService {
  private readonly accountId: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.accountId = (this.config.get<string>('R2_ACCOUNT_ID') ?? '').trim();
    this.accessKeyId = (this.config.get<string>('R2_ACCESS_KEY_ID') ?? '').trim();
    this.secretAccessKey = (this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '').trim();
    this.bucket = (this.config.get<string>('R2_BUCKET') ?? '').trim();
    this.prefix = (this.config.get<string>('R2_KEY_PREFIX') ?? 'ride-platform/media')
      .trim()
      .replace(/^\/+|\/+$/g, '');
  }

  get enabled() {
    return Boolean(this.accountId && this.accessKeyId && this.secretAccessKey && this.bucket);
  }

  objectPath(storedName: string) {
    const key = this.prefix ? `${this.prefix}/${storedName}` : storedName;
    return `r2://${this.bucket}/${key}`;
  }

  async put(storedName: string, body: Buffer, mimeType: string) {
    const key = this.keyFromStoredName(storedName);
    await this.request('PUT', key, body, mimeType);
    return this.objectPath(storedName);
  }

  async get(storagePath: string) {
    const { bucket, key } = this.parseStoragePath(storagePath);
    if (bucket !== this.bucket) {
      throw new Error('R2 bucket mismatch for stored media object.');
    }
    const response = await this.request('GET', key);
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(storagePath: string) {
    const { bucket, key } = this.parseStoragePath(storagePath);
    if (bucket !== this.bucket) return;
    await this.request('DELETE', key);
  }

  isR2Path(storagePath: string) {
    return storagePath.startsWith('r2://');
  }

  private keyFromStoredName(storedName: string) {
    return this.prefix ? `${this.prefix}/${storedName}` : storedName;
  }

  private parseStoragePath(storagePath: string) {
    if (!storagePath.startsWith('r2://')) {
      throw new Error('Media object is not stored in R2.');
    }
    const withoutScheme = storagePath.slice('r2://'.length);
    const slash = withoutScheme.indexOf('/');
    if (slash <= 0 || slash === withoutScheme.length - 1) {
      throw new Error('Invalid R2 media storage path.');
    }
    return {
      bucket: withoutScheme.slice(0, slash),
      key: withoutScheme.slice(slash + 1),
    };
  }

  private async request(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, mimeType?: string) {
    if (!this.enabled) {
      throw new Error('Cloudflare R2 is not configured.');
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const host = `${this.accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${encodeURIComponent(this.bucket)}/${key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
    const payloadHash = createHash('sha256').update(body ?? Buffer.alloc(0)).digest('hex');
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const dateKey = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest();
    const regionKey = createHmac('sha256', dateKey).update('auto').digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    const signingKey = createHmac('sha256', serviceKey).update('aws4_request').digest();
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}${canonicalUri}`, {
      method,
      headers: {
        Authorization: authorization,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...(mimeType ? { 'Content-Type': mimeType } : {}),
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`R2 ${method} failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ''}`);
    }

    return response;
  }
}
