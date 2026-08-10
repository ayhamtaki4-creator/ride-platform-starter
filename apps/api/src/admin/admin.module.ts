import { Module } from '@nestjs/common';
import { AdminBookingControlController } from './admin-booking-control.controller';
import { AdminBookingControlService } from './admin-booking-control.service';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminController } from './admin.controller';
import { AdminDriverContactService } from './admin-driver-contact.service';
import { AdminDriverManagementController } from './admin-driver-management.controller';
import { AdminDriverManagementService } from './admin-driver-management.service';
import { AdminRunsController } from './admin-runs.controller';
import { AdminRunsService } from './admin-runs.service';
import { AdminService } from './admin.service';
import { AdminTrackingController } from './admin-tracking.controller';
import { DriverDayAssignmentPolicyService } from './driver-day-assignment-policy.service';

@Module({
  controllers: [
    AdminController,
    AdminBookingsController,
    AdminBookingControlController,
    AdminDriverManagementController,
    AdminRunsController,
    AdminTrackingController
  ],
  providers: [
    AdminService,
    AdminBookingsService,
    AdminBookingControlService,
    AdminDriverManagementService,
    AdminDriverContactService,
    AdminRunsService,
    DriverDayAssignmentPolicyService
  ]
})
export class AdminModule {}
