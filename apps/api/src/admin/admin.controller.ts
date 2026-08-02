import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { AdminService } from './admin.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { ReassignDriverDto } from './dto/reassign-driver.dto';
import { UnassignDriverDto } from './dto/unassign-driver.dto';

@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Permissions('trip:read:any')
  @Get('trips/pending')
  pendingTrips() {
    return this.adminService.pendingTrips();
  }

  @Permissions('trip:update:any')
  @Get('drivers/available')
  availableDrivers() {
    return this.adminService.availableDrivers();
  }

  @Permissions('trip:update:any')
  @Post('trips/:tripId/assign-driver')
  assignDriver(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: AssignDriverDto
  ) {
    return this.adminService.assignDriver(user, tripId, dto.driverId, dto.vehicleId);
  }

  @Permissions('trip:update:any')
  @Post('trips/:tripId/unassign-driver')
  unassignDriver(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: UnassignDriverDto
  ) {
    return this.adminService.unassignDriver(user, tripId, dto.note);
  }

  @Permissions('trip:update:any')
  @Post('trips/:tripId/reassign-driver')
  reassignDriver(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: ReassignDriverDto
  ) {
    return this.adminService.reassignDriver(
      user,
      tripId,
      dto.driverId,
      dto.vehicleId,
      dto.note
    );
  }

  @Permissions('audit:read:any')
  @Get('audit-logs')
  auditLogs() {
    return this.adminService.auditLogs();
  }
}
