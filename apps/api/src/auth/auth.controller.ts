import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Patch,
  Post,
  Req,
  Res
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Public } from '../iam/public.decorator';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { RefreshCookieService } from './refresh-cookie.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly refreshCookie: RefreshCookieService
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    await this.rateLimit.assertRegistrationAllowed(ipAddress);
    const session = await this.authService.registerPassenger(dto, { userAgent, ipAddress });
    this.markNoStore(response);
    return this.refreshCookie.present(response, session);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    await this.rateLimit.assertLoginAllowed(ipAddress, dto.email);
    const session = await this.authService.login(dto, { userAgent, ipAddress });
    await this.rateLimit.clearLoginIdentity(dto.email);
    this.markNoStore(response);
    return this.refreshCookie.present(response, session);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    await this.rateLimit.assertRefreshAllowed(ipAddress);
    const refreshToken = this.resolveRefreshToken(request, dto);
    const session = await this.authService.refresh(refreshToken, { userAgent, ipAddress });
    this.markNoStore(response);
    return this.refreshCookie.present(response, session);
  }

  @Public()
  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const refreshToken = this.refreshCookie.read(request) ?? dto.refreshToken?.trim() ?? null;
    if (refreshToken) await this.authService.logout(refreshToken);
    this.refreshCookie.clear(response);
    this.markNoStore(response);
    return { success: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.current(user);
  }

  @ApiBearerAuth()
  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto
  ) {
    return this.authService.updatePreferences(user, dto);
  }

  private resolveRefreshToken(request: Request, dto: RefreshTokenDto) {
    const refreshToken = this.refreshCookie.read(request) ?? dto.refreshToken?.trim();
    if (!refreshToken) {
      throw new BadRequestException('رمز تحديث الجلسة غير موجود.');
    }
    return refreshToken;
  }

  private markNoStore(response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
  }
}
