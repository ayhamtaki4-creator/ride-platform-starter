import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { BookingModificationService } from './booking-modification.service';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingModificationController {
  constructor(private readonly modifications: BookingModificationService) {}

  @Permissions('trip:update:own')
  @Patch(':id')
  updateOwn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto
  ) {
    return this.modifications.updatePassenger(user, id, dto);
  }
}

@ApiTags('Administration - Bookings')
@ApiBearerAuth()
@Controller('admin/bookings')
export class AdminBookingModificationController {
  constructor(private readonly modifications: BookingModificationService) {}

  @Permissions('booking:update:any')
  @Patch(':id')
  updateAny(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto
  ) {
    return this.modifications.updateAdmin(user, id, dto);
  }
}
