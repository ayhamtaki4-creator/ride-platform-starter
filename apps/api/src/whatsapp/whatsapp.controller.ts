import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../iam/permissions.decorator';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('Administration - WhatsApp')
@ApiBearerAuth()
@Controller('admin/whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Permissions('booking:read:any')
  @Get('status')
  status() {
    return this.whatsapp.configurationStatus();
  }

  @Permissions('booking:read:any')
  @Get('deliveries')
  deliveries(@Query('status') status?: string) {
    return this.whatsapp.list(status);
  }

  @Permissions('booking:update:any')
  @Post('deliveries/:id/retry')
  retry(@Param('id') id: string) {
    return this.whatsapp.retry(id);
  }
}
