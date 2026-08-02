import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';
import { PricingService } from './pricing.service';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Public()
  @Get()
  active() {
    return this.pricingService.listActive();
  }

  @ApiBearerAuth()
  @Permissions('pricing:manage')
  @Get('admin')
  all() {
    return this.pricingService.listAll();
  }

  @ApiBearerAuth()
  @Permissions('pricing:manage')
  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertPricingRuleDto) {
    return this.pricingService.upsert(user, dto);
  }
}
