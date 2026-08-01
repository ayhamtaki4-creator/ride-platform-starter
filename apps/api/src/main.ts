import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import 'reflect-metadata';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
const webOriginsValue =
  config.get<string>("WEB_ORIGINS") ??
  config.get<string>("WEB_ORIGIN") ??
  "http://localhost:3000";

const webOrigins = webOriginsValue
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.enableCors({
  origin: webOrigins,
  credentials: true,
});
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ride Platform API')
    .setDescription('API الأولي لمنصة النقل متعددة الأدوار')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('PORT', 4000);
await app.listen(port, '0.0.0.0')
;
}

bootstrap();
