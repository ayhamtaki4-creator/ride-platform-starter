import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { Public } from './iam/public.decorator';
import { PrismaService } from './prisma/prisma.service';

type DependencyCheck = {
  status: 'ok' | 'unavailable' | 'skipped';
  latencyMs: number;
  required: boolean;
};

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  check() {
    return {
      status: 'ok',
      service: 'ride-platform-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  @Public()
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async readiness() {
    const startedAt = Date.now();
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();
    const unavailable =
      database.status !== 'ok' ||
      (redis.required && redis.status !== 'ok');

    const payload = {
      status: unavailable
        ? 'unavailable'
        : redis.status === 'ok'
          ? 'ok'
          : 'degraded',
      service: 'ride-platform-api',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks: {
        database,
        redis
      }
    };

    if (unavailable) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        2000,
        'database readiness timeout'
      );
      return {
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        required: true
      };
    } catch {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - startedAt,
        required: true
      };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const startedAt = Date.now();
    const required = this.booleanSetting('HEALTH_REQUIRE_REDIS', false);
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();

    if (!redisUrl) {
      return {
        status: 'skipped',
        latencyMs: Date.now() - startedAt,
        required
      };
    }

    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false
      }
    });
    client.on('error', () => undefined);

    try {
      await client.connect();
      await this.withTimeout(client.ping(), 2000, 'redis readiness timeout');
      return {
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        required
      };
    } catch {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - startedAt,
        required
      };
    } finally {
      if (client.isOpen) {
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }
    }
  }

  private booleanSetting(name: string, fallback: boolean) {
    const raw = this.config.get<string>(name)?.trim().toLowerCase();
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    label: string
  ) {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(label)), timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
