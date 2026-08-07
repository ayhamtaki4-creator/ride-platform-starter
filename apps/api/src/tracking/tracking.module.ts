import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TripRouteEditingService } from './trip-route-editing.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, TripRouteEditingService],
  exports: [TrackingService]
})
export class TrackingModule {}
