import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

type MemoryCounter = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimitService.name);
  private readonly memory = new Map<string, MemoryCounter>();
  private redis?: RedisClient;
  private redisConnectPromise?: Promise<void>;
  private redisFallbackLogged = false;

  constructor(private readonly config: ConfigService) {}

  async assertLoginAllowed(ipAddress: string | undefined, email: string) {
    if (!this.enabled()) return;

    const windowSeconds = this.positiveInt('AUTH_LOGIN_WINDOW_SECONDS', 15 * 60);
    await this.consume(
      'login-ip',
      this.normalizeIp(ipAddress),
      this.positiveInt('AUTH_LOGIN_IP_MAX', 40),
      windowSeconds
    );
    await this.consume(
      'login-identity',
      email.trim().toLowerCase(),
      this.positiveInt('AUTH_LOGIN_IDENTITY_MAX', 8),
      windowSeconds
    );
  }

  async clearLoginIdentity(email: string) {
    if (!this.enabled()) return;
    await this.reset('login-identity', email.trim().toLowerCase());
  }

  async assertRegistrationAllowed(ipAddress: string | undefined) {
    if (!this.enabled()) return;
    await this.consume(
      'register-ip',
      this.normalizeIp(ipAddress),
      this.positiveInt('AUTH_REGISTER_IP_MAX', 6),
      this.positiveInt('AUTH_REGISTER_WINDOW_SECONDS', 60 * 60)
    );
  }

  async assertRefreshAllowed(ipAddress: string | undefined) {
    if (!this.enabled()) return;
    await this.consume(
      'refresh-ip',
      this.normalizeIp(ipAddress),
      this.positiveInt('AUTH_REFRESH_IP_MAX', 120),
      this.positiveInt('AUTH_REFRESH_WINDOW_SECONDS', 15 * 60)
    );
  }

  async assertTicketAnalysisAllowed(ipAddress: string | undefined) {
    if (!this.enabled()) return;
    await this.consume(
      'ticket-analysis-ip',
      this.normalizeIp(ipAddress),
      this.positiveInt('TICKET_ANALYSIS_IP_MAX', 12),
      this.positiveInt('TICKET_ANALYSIS_WINDOW_SECONDS', 60 * 60)
    );
  }

  async onModuleDestroy() {
    if (!this.redis?.isOpen) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async consume(
    scope: string,
    identifier: string,
    limit: number,
    windowSeconds: number
  ) {
    const key = this.key(scope, identifier);
    let result: { count: number; retryAfterSeconds: number };

    try {
      result = await this.consumeRedis(key, windowSeconds);
      this.redisFallbackLogged = false;
    } catch (error) {
      if (!this.redisFallbackLogged) {
        this.redisFallbackLogged = true;
        this.logger.warn(
          `Redis rate limiting unavailable; using per-instance fallback. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      result = this.consumeMemory(key, windowSeconds);
    }

    if (result.count <= limit) return;

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.',
        error: 'Too Many Requests',
        retryAfterSeconds: result.retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  private async reset(scope: string, identifier: string) {
    const key = this.key(scope, identifier);
    this.memory.delete(key);

    try {
      const client = await this.getRedis();
      if (client) await client.del(key);
    } catch {
      // A successful login must not fail merely because Redis is unavailable.
    }
  }

  private async consumeRedis(key: string, windowSeconds: number) {
    const client = await this.getRedis();
    if (!client) throw new Error('REDIS_URL is not configured');

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }
    const ttl = await client.ttl(key);
    return {
      count,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds
    };
  }

  private consumeMemory(key: string, windowSeconds: number) {
    const now = Date.now();
    const current = this.memory.get(key);
    if (!current || current.resetAt <= now) {
      const next = {
        count: 1,
        resetAt: now + windowSeconds * 1000
      };
      this.memory.set(key, next);
      this.pruneMemory(now);
      return { count: 1, retryAfterSeconds: windowSeconds };
    }

    current.count += 1;
    return {
      count: current.count,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  private async getRedis(): Promise<RedisClient | undefined> {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) return undefined;

    if (!this.redis) {
      this.redis = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 1500,
          reconnectStrategy: false
        }
      });
      this.redis.on('error', () => undefined);
    }

    if (this.redis.isOpen) return this.redis;

    if (!this.redisConnectPromise) {
      this.redisConnectPromise = this.redis
        .connect()
        .then(() => undefined)
        .finally(() => {
          this.redisConnectPromise = undefined;
        });
    }

    await this.redisConnectPromise;
    return this.redis;
  }

  private pruneMemory(now: number) {
    if (this.memory.size < 5000) return;
    for (const [key, value] of this.memory) {
      if (value.resetAt <= now) this.memory.delete(key);
      if (this.memory.size < 4000) break;
    }
  }

  private key(scope: string, identifier: string) {
    const digest = createHash('sha256')
      .update(identifier || 'unknown')
      .digest('hex')
      .slice(0, 40);
    return `ride:auth-rate:${scope}:${digest}`;
  }

  private normalizeIp(value?: string) {
    return value?.trim() || 'unknown';
  }

  private positiveInt(name: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(name) ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private enabled() {
    const raw = this.config.get<string>('AUTH_RATE_LIMIT_ENABLED')?.trim().toLowerCase();
    if (!raw) return true;
    return !['0', 'false', 'no', 'off'].includes(raw);
  }
}
