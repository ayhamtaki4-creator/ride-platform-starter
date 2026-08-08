import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { DriverSchedulePolicyService } from './driver-schedule-policy.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { CreateRegionDto } from './dto/create-region.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { EligibleDriversQueryDto } from './dto/eligible-drivers-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { RoutesService } from './routes.service';

@ApiTags('Administration - Routes and Locations')
@ApiBearerAuth()
@Controller('admin')
export class AdminRoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly schedulePolicy: DriverSchedulePolicyService
  ) {}

  @Permissions('route:manage')
  @Get('regions')
  regions() {
    return this.routes.adminRegions();
  }

  @Permissions('route:manage')
  @Post('regions')
  createRegion(@CurrentUser() actor: AuthUser, @Body() dto: CreateRegionDto) {
    return this.routes.createRegion(actor, dto);
  }

  @Permissions('route:manage')
  @Patch('regions/:id')
  updateRegion(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRegionDto
  ) {
    return this.routes.updateRegion(actor, id, dto);
  }

  @Permissions('route:manage')
  @Get('locations')
  locations() {
    return this.routes.adminLocations();
  }

  @Permissions('route:manage')
  @Post('locations')
  createLocation(@CurrentUser() actor: AuthUser, @Body() dto: CreateLocationDto) {
    return this.routes.createLocation(actor, dto);
  }

  @Permissions('route:manage')
  @Patch('locations/:id')
  updateLocation(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto
  ) {
    return this.routes.updateLocation(actor, id, dto);
  }

  @Permissions('route:manage')
  @Get('routes')
  list() {
    return this.routes.adminRoutes();
  }

  @Permissions('route:manage')
  @Post('routes')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateRouteDto) {
    return this.routes.createRoute(actor, dto);
  }

  @Permissions('route:manage')
  @Patch('routes/:id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto
  ) {
    return this.routes.updateRoute(actor, id, dto);
  }

  @Permissions('route:manage')
  @Post('routes/:id/activate')
  activate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.routes.setRouteActive(actor, id, true);
  }

  @Permissions('route:manage')
  @Post('routes/:id/deactivate')
  deactivate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.routes.setRouteActive(actor, id, false);
  }

  @Permissions('trip:update:any')
  @Get('routes/:id/eligible-drivers')
  async eligibleDrivers(
    @Param('id') id: string,
    @Query() query: EligibleDriversQueryDto
  ) {
    const rows = await this.routes.eligibleDrivers(id, query);
    return this.schedulePolicy.applySameDayReturnPolicy(
      id,
      new Date(query.travelDate),
      rows
    );
  }
}
