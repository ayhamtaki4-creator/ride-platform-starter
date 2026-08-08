import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { TrackingService } from './tracking.service';
import { TripRouteEditingService } from './trip-route-editing.service';

@ApiTags('Trip Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly routeEditing: TripRouteEditingService
  ) {}

  @ApiBearerAuth()
  @Permissions()
  @Get('trips/:tripId')
  getTripTracking(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.tracking.getTripTracking(user, tripId);
  }

  @ApiBearerAuth()
  @Permissions()
  @Patch('trips/:tripId/route-plan')
  updateRoutePlan(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body()
    body: {
      geometry: unknown;
      waypoints?: unknown;
      distanceKm?: number;
      durationMinutes?: number;
    }
  ) {
    return this.routeEditing.updateRoutePlan(user, tripId, body);
  }

  @ApiBearerAuth()
  @Permissions()
  @Patch('trips/:tripId/endpoints')
  updateEndpoints(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body()
    body: {
      originAddress: string;
      originLatitude: number;
      originLongitude: number;
      destinationAddress: string;
      destinationLatitude: number;
      destinationLongitude: number;
      geometry: unknown;
      waypoints?: unknown;
      distanceKm?: number;
      durationMinutes?: number;
    }
  ) {
    return this.routeEditing.updateEndpoints(user, tripId, body);
  }

  @ApiBearerAuth()
  @Permissions('trip:update:own')
  @Post('trips/:tripId/location')
  updateDriverLocation(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body()
    body: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
      recordedAt?: string;
    }
  ) {
    return this.tracking.updateDriverLocation(user, tripId, body);
  }

  @ApiBearerAuth()
  @Permissions('trip:read:own')
  @Post('trips/:tripId/shares')
  createShare(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.tracking.createShare(user, tripId);
  }

  @ApiBearerAuth()
  @Permissions('trip:read:own')
  @Delete('trips/:tripId/shares/:shareId')
  revokeShare(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('shareId') shareId: string
  ) {
    return this.tracking.revokeShare(user, tripId, shareId);
  }

  @Public()
  @Get('public/:token')
  publicTracking(@Param('token') token: string) {
    return this.tracking.getPublicTracking(token);
  }
}
