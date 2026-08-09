import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { createHttpObservabilityMiddleware } from './common/http-observability';
import { RetryAfterInterceptor } from './common/retry-after.interceptor';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

// Service dates are business-calendar dates, not server-local timestamps.
// Pin Node's local timezone before any request work so legacy date-boundary
// code behaves consistently on Render, local development, and CI. New code
// should still prefer the explicit helpers in common/service-date.ts.
process.env.TZ = process.env.SERVICE_TIME_ZONE?.trim() || 'Asia/Damascus';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';

  const webOriginsValue =
    config.get<string>('WEB_ORIGINS') ??
    config.get<string>('WEB_ORIGIN') ??
    'http://localhost:3000';

  const webOrigins = webOriginsValue
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (webOrigins.includes('*')) {
    throw new Error(
      'WEB_ORIGINS cannot contain * while credentialed CORS is enabled. Configure explicit portal origins.'
    );
  }

  const httpServer = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: unknown): void;
  };
  const configuredTrustProxyHops = Number.parseInt(
    config.get<string>('TRUST_PROXY_HOPS') ?? '',
    10
  );
  const trustProxyHops = Number.isInteger(configuredTrustProxyHops)
    ? Math.max(0, configuredTrustProxyHops)
    : isProduction
      ? 1
      : 0;
  httpServer.set('trust proxy', trustProxyHops > 0 ? trustProxyHops : false);
  httpServer.disable('x-powered-by');

  const requestLoggingSetting = config
    .get<string>('HTTP_REQUEST_LOG_ENABLED')
    ?.trim()
    .toLowerCase();
  const requestLoggingEnabled = requestLoggingSetting
    ? ['1', 'true', 'yes', 'on'].includes(requestLoggingSetting)
    : isProduction;

  app.use(
    createHttpObservabilityMiddleware({
      loggingEnabled: requestLoggingEnabled,
      serviceName: 'ride-platform-api'
    })
  );

  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(self)'
    );
    if (isProduction) {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }
    next();
  });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After']
  });
  app.useGlobalInterceptors(new RetryAfterInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const redisIoAdapter = new RedisIoAdapter(app, config);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const swaggerSetting = config.get<string>('SWAGGER_ENABLED')?.trim().toLowerCase();
  const swaggerEnabled = swaggerSetting
    ? ['1', 'true', 'yes', 'on'].includes(swaggerSetting)
    : !isProduction;

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ride Platform API')
      .setDescription('API لمنصة النقل متعددة الأدوار ومركز التوزيع المباشر')
      .setVersion('0.4.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
