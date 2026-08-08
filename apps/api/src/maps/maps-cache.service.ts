import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

type CachedEnvelope<T> = {
  value: T;
};

@Injectable()
export class MapsCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(MapsCacheService.name);
  private redis?: RedisClient;
  private connectPromise?: Promise<void>;
  private fallbackLogged = false;

  constructor(private readonly config: ConfigService) {}

  async remember<T>(
    scope: string,
    identity: string,
    ttlSeconds: number,
    loader: () => Promise<T>
  ): Promise<T> {
    if (!this.enabled()) return loader();

    const key = this.key(scope, identity);
    const cached = await this.read<T>(key);
    if (cached.hit) return cached.value as T;

    const value = await loader();
    await this.write(key, value, ttlSeconds);
    return value;
  }

  async onModuleDestroy() {
    if (!this.redis?.isOpen) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async read<T>(key: string): Promise<{ hit: boolean; value?: T }> {
    try {
      const client = await this.getRedis();
      if (!client) return { hit: false };
      const raw = await client.get(key);
      this.fallbackLogged = false;
      if (!raw) return { hit: false };

      const parsed = JSON.parse(raw) as CachedEnvelope<T>;
      if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) {
        return { hit: false };
      }
      return { hit: true, value: parsed.value };
    } catch (error) {
      this.logFallback(error);
      return { hit: false };
    }
  }

  private async write<T>(key: string, value: T, ttlSeconds: number) {
    try {
      const client = await this.getRedis();
      if (!client) return;
      await client.setEx(
        key,
        Math.max(1, Math.floor(ttlSeconds)),
        JSON.stringify({ value } satisfies CachedEnvelope<T>)
      );
      this.fallbackLogged = false;
    } catch (error) {
      this.logFallback(error);
    }
  }

  private async getRedis(): Promise<RedisClient | undefined> {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) return undefined;

    if (!this.redis) {
      this.redis = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 1200,
          reconnectStrategy: false
        }
      });
      this.redis.on('error', () => undefined);
    }

    if (this.redis.isOpen) return this.redis;

    if (!this.connectPromise) {
      this.connectPromise = this.redis
        .connect()
        .then(() => undefined)
        .finally(() => {
          this.connectPromise = undefined;
        });
    }

    await this.connectPromise;
    return this.redis;
  }

  private key(scope: string, identity: string) {
    const digest = createHash('sha256')
      .update(identity)
      .digest('hex')
      .slice(0, 48);
    return `ride:maps:v1:${scope}:${digest}`;
  }

  private enabled() {
    const raw = this.config
      .get<string>('MAPS_CACHE_ENABLED')
      ?.trim()
      .toLowerCase();
    if (raw) return !['0', 'false', 'no', 'off'].includes(raw);
    return Boolean(this.config.get<string>('REDIS_URL')?.trim());
  }

  private logFallback(error: unknown) {
    if (this.fallbackLogged) return;
    this.fallbackLogged = true;
    this.logger.warn(
      `Maps cache unavailable; calling the configured maps provider directly. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
