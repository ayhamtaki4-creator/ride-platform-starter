import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { RejectAssignmentDto } from './dto/reject-assignment.dto';
import { RejectRunDto } from './dto/reject-run.dto';
import { UpdateRunPassengerStatusDto } from './dto/update-run-passenger-status.dto';
import { UpdateDriverAvailabilityDto } from './dto/update-driver-availability.dto';
import { DriverRunsService } from './driver-runs.service';
import { DriversService } from './drivers.service';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverRuns: DriverRunsService
  ) {}

  @Permissions('driver:read:own')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.driversService.mine(user);
  }

  @Permissions('driver:read:own')
  @Get('me/schedule')
  schedule(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string
  ) {
    return this.driversService.schedule(user, date);
  }

  @Permissions('trip:accept')
  @Post('me/bookings/:tripId/accept')
  acceptAssignment(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string
  ) {
    return this.driversService.acceptAssignment(user, tripId);
  }

  @Permissions('trip:accept')
  @Post('me/bookings/:tripId/reject')
  rejectAssignment(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: RejectAssignmentDto
  ) {
    return this.driversService.rejectAssignment(
      user,
      tripId,
      dto.reason
    );
  }


  @Permissions('trip:read:own')
  @Get('me/runs')
  runs(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string
  ) {
    return this.driverRuns.list(user, date);
  }

  @Permissions('trip:read:own')
  @Get('me/runs/:runId')
  runDetail(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string
  ) {
    return this.driverRuns.detail(user, runId);
  }

  @Permissions('trip:accept')
  @Post('me/runs/:runId/accept')
  acceptRun(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string
  ) {
    return this.driverRuns.accept(user, runId);
  }

  @Permissions('trip:accept')
  @Post('me/runs/:runId/reject')
  rejectRun(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
    @Body() dto: RejectRunDto
  ) {
    return this.driverRuns.reject(user, runId, dto.reason);
  }

  @Permissions('trip:update:own')
  @Post('me/runs/:runId/boarding')
  startBoarding(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string
  ) {
    return this.driverRuns.startBoarding(user, runId);
  }

  @Permissions('trip:update:own')
  @Patch('me/runs/:runId/bookings/:bookingId/status')
  updatePassengerStatus(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateRunPassengerStatusDto
  ) {
    return this.driverRuns.updatePassengerStatus(
      user,
      runId,
      bookingId,
      dto.status
    );
  }

  @Permissions('trip:update:own')
  @Post('me/runs/:runId/start')
  startRun(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string
  ) {
    return this.driverRuns.start(user, runId);
  }

  @Permissions('trip:update:own')
  @Post('me/runs/:runId/complete')
  completeRun(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string
  ) {
    return this.driverRuns.complete(user, runId);
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
