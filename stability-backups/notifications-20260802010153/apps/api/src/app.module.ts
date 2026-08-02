import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ComplianceModule } from './compliance/compliance.module';
import { DriversModule } from './drivers/drivers.module';
import { HealthController } from './health.controller';
import { MediaModule } from './media/media.module';
import { PermissionsGuard } from './iam/permissions.guard';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoutesModule } from './routes/routes.module';
import { TripsModule } from './trips/trips.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MediaModule,
    ComplianceModule,
    AuthModule,
    RealtimeModule,
    UsersModule,
    DriversModule,
    TripsModule,
    BookingsModule,
    PricingModule,
    RoutesModule,
    AdminModule
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }]
})
export class AppModule {}
