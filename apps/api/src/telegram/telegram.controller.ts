import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../iam/permissions.decorator';
import { TelegramService } from './telegram.service';

@ApiTags('Administration - Telegram')
@ApiBearerAuth()
@Controller('admin/telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Permissions('booking:read:any')
  @Get('status')
  status() {
    return this.telegram.configurationStatus();
  }

  @Permissions('booking:read:any')
  @Get('deliveries')
  deliveries(@Query('status') status?: string) {
    return this.telegram.list(status);
  }

  @Permissions('booking:update:any')
  @Post('test')
  test() {
    return this.telegram.sendTest();
  }

  @Permissions('booking:update:any')
  @Post('deliveries/:id/retry')
  retry(@Param('id') id: string) {
    return this.telegram.retry(id);
  }
}
