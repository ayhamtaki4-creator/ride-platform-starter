import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { RouteTemplatesService } from './route-templates.service';

type RouteTemplateBody = {
  originAddress: string;
  originLatitude: number;
  originLongitude: number;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  geometry?: unknown;
  waypoints?: unknown;
  distanceKm?: number;
  durationMinutes?: number;
};

@ApiTags('Service Route Templates')
@Controller('route-templates')
export class RouteTemplatesController {
  constructor(private readonly templates: RouteTemplatesService) {}

  @Public()
  @Get()
  list() {
    return this.templates.publicList();
  }

  @Public()
  @Get(':routeId')
  detail(@Param('routeId') routeId: string) {
    return this.templates.publicGet(routeId);
  }
}

@ApiTags('Administration - Route Templates')
@ApiBearerAuth()
@Controller('admin/route-templates')
export class AdminRouteTemplatesController {
  constructor(private readonly templates: RouteTemplatesService) {}

  @Permissions('route:manage')
  @Get()
  list() {
    return this.templates.adminList();
  }

  @Permissions('route:manage')
  @Get(':routeId')
  detail(@Param('routeId') routeId: string) {
    return this.templates.adminGet(routeId);
  }

  @Permissions('route:manage')
  @Patch(':routeId')
  save(
    @CurrentUser() actor: AuthUser,
    @Param('routeId') routeId: string,
    @Body() body: RouteTemplateBody
  ) {
    return this.templates.save(actor, routeId, body);
  }
}

@ApiTags('Trip Route Endpoints')
@ApiBearerAuth()
@Controller('tracking/trips')
export class TripRouteEndpointsController {
  constructor(private readonly templates: RouteTemplatesService) {}

  @Permissions()
  @Patch(':tripId/endpoints')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: RouteTemplateBody
  ) {
    return this.templates.updateTripEndpoints(actor, tripId, body);
  }
}
