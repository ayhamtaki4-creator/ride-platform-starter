import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { BookingsService } from './bookings.service';
import { BookingQuoteDto } from './dto/booking-quote.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Public()
  @Get('quote')
  quote(@Query() dto: BookingQuoteDto) {
    return this.bookingsService.quote(dto);
  }

  @ApiBearerAuth()
  @Permissions('booking:create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user, dto);
  }

  @ApiBearerAuth()
  @Permissions('booking:read:own')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.bookingsService.mine(user);
  }
}
