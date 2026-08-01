import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { CreateTripDto } from './dto/create-trip.dto';
import { EstimateTripDto } from './dto/estimate-trip.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { TransitionTripDto } from './dto/transition-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Permissions('trip:create')
  @Post('estimate')
  estimate(@Body() dto: EstimateTripDto) {
    return this.tripsService.estimate(dto);
  }

  @Permissions('trip:read:own')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.tripsService.mine(user);
  }

  @Permissions('trip:accept')
  @Get('available')
  available(@CurrentUser() user: AuthUser) {
    return this.tripsService.available(user);
  }

  @Permissions('trip:read:any')
  @Get()
  all() {
    return this.tripsService.all();
  }

  @Permissions('trip:create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.tripsService.create(user, dto);
  }

  @Permissions('trip:update:own')
  @Post(':id/start-pin')
  rotateStartPin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.rotateStartPin(user, id);
  }

  @Permissions('trip:accept')
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.accept(user, id);
  }

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
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: StartTripDto
  ) {
    return this.tripsService.start(user, id, dto.pin);
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
