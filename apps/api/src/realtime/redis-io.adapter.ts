import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';

type ClosableRedisClient = {
  readonly isOpen: boolean;
  quit(): Promise<unknown>;
  disconnect(): void;
};

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: ClosableRedisClient;
  private subClient?: ClosableRedisClient;

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService
  ) {
    super(app);
  }

  async connectToRedis() {
    const redisUrl = this.config.get<string>(
      'REDIS_URL',
      'redis://127.0.0.1:6379'
    );

    try {
      const pubClient = createClient({ url: redisUrl });
      this.pubClient = pubClient;

      pubClient.on('error', (error) => {
        this.logger.warn(`Redis pub/sub error: ${error.message}`);
      });

      await Promise.race([
        pubClient.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 4000)
        )
      ]);

      const subClient = pubClient.duplicate();
      this.subClient = subClient;

      subClient.on('error', (error) => {
        this.logger.warn(`Redis subscriber error: ${error.message}`);
      });

      await subClient.connect();

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis adapter connected.');
      return true;
    } catch (error) {
      this.logger.warn(
        `Redis unavailable; WebSocket will use in-memory adapter. ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      await this.safeQuit(this.subClient);
      await this.safeQuit(this.pubClient);
      return false;
    }
  }

  createIOServer(port: number, options?: ServerOptions) {
    const originsValue =
      this.config.get<string>('WEB_ORIGINS') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3000';

    const allowedOrigins = originsValue
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST']
      }
    }) as Server;

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }

  private async safeQuit(client?: ClosableRedisClient) {
    if (!client?.isOpen) return;

    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}
