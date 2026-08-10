import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { TransitionTripDto } from './dto/transition-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('Trip Execution')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Permissions('trip:update:own')
  @Post(':id/arriving')
  arriving(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.driverTransition(user, id, 'DRIVER_ARRIVING');
  }

  @Permissions('trip:update:own')
  @Post(':id/arrived')
  arrived(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.driverTransition(user, id, 'DRIVER_ARRIVED');
  }

  @Permissions('trip:update:own')
  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.start(user, id);
  }

  @Permissions('trip:update:own')
  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransitionTripDto
  ) {
    return this.tripsService.complete(user, id, dto.note);
  }

  @Permissions('trip:update:own')
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransitionTripDto
  ) {
    return this.tripsService.cancel(user, id, dto.note);
  }
}
