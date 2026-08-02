import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ServiceRunStatus } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { AdminRunsService } from './admin-runs.service';
import { CreateServiceRunDto } from './dto/create-service-run.dto';
import { MoveRunBookingDto } from './dto/move-run-booking.dto';
import { ReplaceRunDriverDto } from './dto/replace-run-driver.dto';
import { RunNoteDto } from './dto/run-note.dto';

@ApiTags('Admin Service Runs')
@ApiBearerAuth()
@Controller('admin/runs')
export class AdminRunsController {
  constructor(private readonly runs: AdminRunsService) {}

  @Permissions('trip:read:any')
  @Get()
  list(
    @Query('status') status?: ServiceRunStatus,
    @Query('date') date?: string,
    @Query('search') search?: string
  ) {
    return this.runs.list(status, date, search);
  }

  @Permissions('trip:read:any')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.runs.detail(id);
  }

  @Permissions('trip:update:any')
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateServiceRunDto) {
    return this.runs.create(actor, dto);
  }

  @Permissions('trip:update:any')
  @Post(':id/bookings/:bookingId')
  addBooking(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('bookingId') bookingId: string
  ) {
    return this.runs.addBooking(actor, id, bookingId);
  }

  @Permissions('trip:update:any')
  @Delete(':id/bookings/:bookingId')
  removeBooking(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('bookingId') bookingId: string
  ) {
    return this.runs.removeBooking(actor, id, bookingId);
  }

  @Permissions('trip:update:any')
  @Post(':id/bookings/:bookingId/move')
  moveBooking(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: MoveRunBookingDto
  ) {
    return this.runs.moveBooking(actor, id, bookingId, dto.targetRunId);
  }

  @Permissions('trip:update:any')
  @Post(':id/schedule')
  schedule(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.runs.schedule(actor, id);
  }

  @Permissions('trip:update:any')
  @Post(':id/replace-driver')
  replaceDriver(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplaceRunDriverDto
  ) {
    return this.runs.replaceDriver(actor, id, dto);
  }

  @Permissions('trip:update:any')
  @Post(':id/cancel')
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: RunNoteDto
  ) {
    return this.runs.cancel(actor, id, dto.note);
  }
}
