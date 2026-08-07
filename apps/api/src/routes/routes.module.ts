import { Module } from '@nestjs/common';
import { AdminRoutesController } from './admin-routes.controller';
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
    TripRouteEndpointsController
  ],
  providers: [RoutesService, RouteTemplatesService],
  exports: [RoutesService, RouteTemplatesService]
})
export class RoutesModule {}
