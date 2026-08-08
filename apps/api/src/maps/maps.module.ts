import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MapsCacheService } from './maps-cache.service';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';

@Module({
  imports: [AuthModule],
  controllers: [MapsController],
  providers: [MapsCacheService, MapsService],
  exports: [MapsService]
})
export class MapsModule {}
