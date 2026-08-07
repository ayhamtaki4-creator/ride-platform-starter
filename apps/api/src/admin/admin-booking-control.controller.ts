import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { AdminBookingControlService } from './admin-booking-control.service';
import { AdminUpdateBookingDto } from './dto/admin-update-booking.dto';

@ApiTags('Administration - Booking control')
@ApiBearerAuth()
@Controller('admin/booking-control')
export class AdminBookingControlController {
  constructor(private readonly controls: AdminBookingControlService) {}

  @Permissions('booking:update:any')
  @Patch(':tripId')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: AdminUpdateBookingDto
  ) {
    return this.controls.update(actor, tripId, dto);
  }

  @Permissions('booking:update:any')
  @Post(':tripId/accept-driver')
  acceptDriver(@CurrentUser() actor: AuthUser, @Param('tripId') tripId: string) {
    return this.controls.acceptDriverOnBehalf(actor, tripId);
  }
}
