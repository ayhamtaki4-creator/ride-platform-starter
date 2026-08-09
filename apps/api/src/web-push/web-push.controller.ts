import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post
} from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import {
  RemoveWebPushSubscriptionDto,
  UpsertWebPushSubscriptionDto
} from './dto/upsert-web-push-subscription.dto';
import { WebPushService } from './web-push.service';

@Controller('web-push')
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get('config')
  config() {
    return this.webPush.clientConfig();
  }

  @Post('subscriptions')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertWebPushSubscriptionDto,
    @Headers('user-agent') userAgent?: string
  ) {
    return this.webPush.upsertSubscription(
      user.sub,
      dto,
      userAgent
    );
  }

  @Delete('subscriptions')
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: RemoveWebPushSubscriptionDto
  ) {
    return this.webPush.removeSubscription(
      user.sub,
      dto.endpoint
    );
  }
}
