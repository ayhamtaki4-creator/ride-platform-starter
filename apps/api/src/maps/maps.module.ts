import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';

@Module({
  imports: [AuthModule],
  controllers: [MapsController],
  providers: [MapsService],
  exports: [MapsService]
})
export class MapsModule {}
