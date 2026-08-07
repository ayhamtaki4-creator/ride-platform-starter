import { Module } from '@nestjs/common';
import { AdminRoutesController } from './admin-routes.controller';
import {
  AdminRouteBookingPoliciesController,
  RouteBookingPoliciesController
} from './route-booking-policies.controller';
import { RouteBookingPoliciesService } from './route-booking-policies.service';
import {
  AdminRouteTemplatesController,
  RouteTemplatesController,
  TripRouteEndpointsController
} from './route-templates.controller';
import { RouteTemplatesService } from './route-templates.service';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [
    RoutesController,
    AdminRoutesController,
    RouteTemplatesController,
    AdminRouteTemplatesController,
    TripRouteEndpointsController,
    RouteBookingPoliciesController,
    AdminRouteBookingPoliciesController
  ],
  providers: [RoutesService, RouteTemplatesService, RouteBookingPoliciesService],
  exports: [RoutesService, RouteTemplatesService, RouteBookingPoliciesService]
})
export class RoutesModule {}
