import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { CreateDriverReviewDto } from './dto/create-driver-review.dto';
import { DriverReviewsService } from './driver-reviews.service';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class PassengerDriverReviewsController {
  constructor(private readonly reviews: DriverReviewsService) {}

  @Permissions('booking:read:own')
  @Get('me/driver-reviews')
  mine(@CurrentUser() user: AuthUser) {
    return this.reviews.listForPassenger(user);
  }

  @Permissions('booking:read:own')
  @Post(':id/driver-review')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateDriverReviewDto
  ) {
    return this.reviews.createForBooking(user, id, dto);
  }
}

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriverReviewsController {
  constructor(private readonly reviews: DriverReviewsService) {}

  @Permissions('driver:read:own')
  @Get('me/reviews')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string
  ) {
    return this.reviews.listForDriver(user, limit);
  }
}
