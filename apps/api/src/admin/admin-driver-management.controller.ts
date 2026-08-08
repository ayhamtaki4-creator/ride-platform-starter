import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { AdminDriverContactService } from './admin-driver-contact.service';
import { AdminDriverManagementService } from './admin-driver-management.service';
import { AddVehicleImageDto } from './dto/add-vehicle-image.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateAccessRegionsDto } from './dto/update-access-regions.dto';
import { UpdateDriverContactDto } from './dto/update-driver-contact.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';

@ApiTags('Administration - Drivers')
@ApiBearerAuth()
@Controller('admin/drivers')
export class AdminDriverManagementController {
  constructor(
    private readonly drivers: AdminDriverManagementService,
    private readonly contacts: AdminDriverContactService
  ) {}

  @Permissions('driver:review')
  @Get()
  list() {
    return this.drivers.list();
  }

  @Permissions('driver:review')
  @Get(':driverId')
  detail(@Param('driverId') driverId: string) {
    return this.drivers.detail(driverId);
  }

  @Permissions('driver:review')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user, dto);
  }

  @Permissions('driver:review')
  @Patch(':driverId/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverStatusDto
  ) {
    return this.drivers.updateStatus(user, driverId, dto.status);
  }

  @Permissions('driver:review')
  @Patch(':driverId/profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverProfileDto
  ) {
    return this.drivers.updateProfile(user, driverId, dto);
  }

  @Permissions('driver:review')
  @Patch(':driverId/contact')
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverContactDto
  ) {
    return this.contacts.update(user, driverId, dto.phone);
  }

  @Permissions('driver:review')
  @Put(':driverId/regions')
  updateDriverRegions(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateAccessRegionsDto
  ) {
    return this.drivers.updateDriverRegions(user, driverId, dto);
  }

  @Permissions('driver:review')
  @Post(':driverId/vehicles')
  addVehicle(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: CreateVehicleDto
  ) {
    return this.drivers.addVehicle(user, driverId, dto);
  }

  @Permissions('driver:review')
  @Patch(':driverId/vehicle')
  updatePrimaryVehicle(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverVehicleDto
  ) {
    return this.drivers.updateVehicle(user, driverId, dto);
  }

  @Permissions('driver:review')
  @Patch(':driverId/vehicles/:vehicleId')
  updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateDriverVehicleDto
  ) {
    return this.drivers.updateVehicleById(user, driverId, vehicleId, dto);
  }

  @Permissions('driver:review')
  @Put(':driverId/vehicles/:vehicleId/regions')
  updateVehicleRegions(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateAccessRegionsDto
  ) {
    return this.drivers.updateVehicleRegions(user, driverId, vehicleId, dto);
  }

  @Permissions('driver:review')
  @Post(':driverId/vehicles/:vehicleId/images')
  addVehicleImage(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: AddVehicleImageDto
  ) {
    return this.drivers.addVehicleImage(user, driverId, vehicleId, dto);
  }
}
