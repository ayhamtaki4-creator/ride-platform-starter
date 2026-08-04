import { Body, Controller, Get, Param, Post, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('Administration - Bookings')
@ApiBearerAuth()
@Controller('admin')
export class AdminBookingsController {
  constructor(private readonly bookings: AdminBookingsService) {}

  @Permissions('booking:read:any')
  @Get('dashboard')
  dashboard() {
    return this.bookings.dashboard();
  }

  @Permissions('booking:read:any')
  @Get('bookings')  
  list(@Query() query: AdminBookingsQueryDto) {
    return this.bookings.list(query);
  }

  @Permissions('booking:read:any')
  @Get('bookings/:id')
  detail(@Param('id') id: string) {
    return this.bookings.detail(id);
  }

  @Permissions('booking:update:any')
  @Post('bookings/:id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.confirm(user, id);
  }

  @Permissions('booking:update:any')
  @Post('bookings/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectBookingDto
  ) {
    return this.bookings.reject(user, id, dto.note);
  }

  @Permissions('booking:update:any')
  @Patch('bookings/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookings.update(user, id, dto);
  }
}
