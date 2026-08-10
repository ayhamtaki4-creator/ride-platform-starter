import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { MobilePushService } from './mobile-push.service';

@Controller('mobile-push')
export class MobilePushController {
  constructor(private readonly mobilePush: MobilePushService) {}

  @Get('config')
  config() {
    return this.mobilePush.clientConfig();
  }

  @Post('devices')
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      token?: string;
      platform?: string;
      deviceId?: string;
      appVersion?: string;
    }
  ) {
    return this.mobilePush.registerDevice(user.sub, body);
  }

  @Delete('devices')
  unregisterDevice(
    @CurrentUser() user: AuthUser,
    @Body() body: { token?: string }
  ) {
    return this.mobilePush.unregisterDevice(user.sub, body.token);
  }
}
