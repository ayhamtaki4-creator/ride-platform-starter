import { Global, Module } from '@nestjs/common';
import { MobilePushController } from './mobile-push.controller';
import { MobilePushService } from './mobile-push.service';

@Global()
@Module({
  controllers: [MobilePushController],
  providers: [MobilePushService],
  exports: [MobilePushService]
})
export class MobilePushModule {}
