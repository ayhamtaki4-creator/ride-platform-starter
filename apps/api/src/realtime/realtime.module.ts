import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule],
  providers: [RealtimeEventsService, RealtimeGateway],
  exports: [RealtimeEventsService]
})
export class RealtimeModule {}
