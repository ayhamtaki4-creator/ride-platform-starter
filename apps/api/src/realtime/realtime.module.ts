import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrackingModule } from '../tracking/tracking.module';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule, TrackingModule],
  providers: [RealtimeEventsService, RealtimeGateway],
  exports: [RealtimeEventsService]
})
export class RealtimeModule {}
