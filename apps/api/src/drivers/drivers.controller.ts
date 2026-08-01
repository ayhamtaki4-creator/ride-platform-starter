import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { UpdateDriverAvailabilityDto } from './dto/update-driver-availability.dto';
import { DriversService } from './drivers.service';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Permissions('driver:read:own')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.driversService.mine(user);
  }

  @Permissions('driver:availability:update')
  @Patch('me/availability')
  updateAvailability(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDriverAvailabilityDto
  ) {
    return this.driversService.setAvailability(user, dto.availability);
  }
}
