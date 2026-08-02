import { Module } from '@nestjs/common';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminController } from './admin.controller';
import { AdminDriverManagementController } from './admin-driver-management.controller';
import { AdminDriverManagementService } from './admin-driver-management.service';
import { AdminRunsController } from './admin-runs.controller';
import { AdminRunsService } from './admin-runs.service';
import { AdminService } from './admin.service';

@Module({
  controllers: [
    AdminController,
    AdminBookingsController,
    AdminDriverManagementController,
    AdminRunsController
  ],
  providers: [
    AdminService,
    AdminBookingsService,
    AdminDriverManagementService,
    AdminRunsService
  ]
})
export class AdminModule {}
