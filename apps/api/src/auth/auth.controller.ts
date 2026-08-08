import { Body, Controller, Get, Headers, Ip, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Public } from '../iam/public.decorator';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimit: AuthRateLimitService
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    await this.rateLimit.assertRegistrationAllowed(ipAddress);
    return this.authService.registerPassenger(dto, { userAgent, ipAddress });
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    await this.rateLimit.assertLoginAllowed(ipAddress, dto.email);
    const session = await this.authService.login(dto, { userAgent, ipAddress });
    await this.rateLimit.clearLoginIdentity(dto.email);
    return session;
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    await this.rateLimit.assertRefreshAllowed(ipAddress);
    return this.authService.refresh(dto.refreshToken, { userAgent, ipAddress });
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
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
}
