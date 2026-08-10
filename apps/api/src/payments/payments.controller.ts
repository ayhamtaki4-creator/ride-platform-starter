import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
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
