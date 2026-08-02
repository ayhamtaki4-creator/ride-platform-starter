import { Module } from '@nestjs/common';
import { DriverRunsService } from './driver-runs.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [DriversController],
  providers: [DriversService, DriverRunsService]
})
export class DriversModule {}
