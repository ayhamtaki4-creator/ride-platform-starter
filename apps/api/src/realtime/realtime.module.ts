import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobilePushModule } from '../mobile-push/mobile-push.module';
import { TrackingModule } from '../tracking/tracking.module';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule, TrackingModule, MobilePushModule],
  providers: [RealtimeEventsService, RealtimeGateway],
  exports: [RealtimeEventsService]
})
export class RealtimeModule {}
