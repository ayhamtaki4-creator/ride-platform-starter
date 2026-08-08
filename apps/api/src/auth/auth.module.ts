import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { RefreshCookieService } from './refresh-cookie.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as any
        }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, RefreshCookieService],
  exports: [JwtModule, AuthService, AuthRateLimitService, RefreshCookieService]
})
export class AuthModule {}
