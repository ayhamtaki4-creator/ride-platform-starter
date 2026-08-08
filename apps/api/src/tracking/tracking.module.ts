import { Module } from '@nestjs/common';
import { LocationIngressThrottleService } from './location-ingress-throttle.service';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TripRouteEditingService } from './trip-route-editing.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, TripRouteEditingService, LocationIngressThrottleService],
  exports: [TrackingService, LocationIngressThrottleService]
})
export class TrackingModule {}
