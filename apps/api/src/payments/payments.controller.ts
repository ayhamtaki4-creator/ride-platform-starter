import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { CreateDriverSettlementDto } from './dto/create-driver-settlement.dto';
import { UpdateCashPaymentDto } from './dto/update-cash-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Administration - Payments')
@ApiBearerAuth()
@Controller('admin/bookings')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Permissions('booking:update:any')
  @Post(':id/payment')
  updatePayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCashPaymentDto
  ) {
    return this.payments.updateCashPayment(user, id, dto);
  }
}

@ApiTags('Administration - Driver Finance')
@ApiBearerAuth()
@Controller('admin/driver-finance')
export class AdminDriverFinanceController {
  constructor(private readonly payments: PaymentsService) {}

  @Permissions('trip:read:any')
  @Get()
  summary() {
    return this.payments.adminDriverFinanceSummary();
  }

  @Permissions('trip:read:any')
  @Get(':driverId')
  detail(@Param('driverId') driverId: string) {
    return this.payments.driverFinanceDetail(driverId);
  }

  @Permissions('payment:refund')
  @Post(':driverId/settlements')
  settle(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: CreateDriverSettlementDto
  ) {
    return this.payments.createDriverSettlement(user, driverId, dto);
  }
}

@ApiTags('Drivers - Payments')
@ApiBearerAuth()
@Controller('drivers/me/bookings')
export class DriverPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Permissions('trip:update:own')
  @Post(':id/cash-payment')
  receivedCash(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string
  ) {
    return this.payments.driverReceivedCash(user, id);
  }
}

@ApiTags('Drivers - Finance')
@ApiBearerAuth()
@Controller('drivers/me/finance')
export class DriverFinanceController {
  constructor(private readonly payments: PaymentsService) {}

  @Permissions('trip:read:own')
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.payments.driverFinanceForSelf(user);
  }
}
