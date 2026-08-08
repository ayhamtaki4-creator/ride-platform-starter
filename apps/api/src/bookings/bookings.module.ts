import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MapsModule } from '../maps/maps.module';
import { BookingDriverContactService } from './booking-driver-contact.service';
import { BookingRoutePlanService } from './booking-route-plan.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { FlightTicketExtractorService } from './flight-ticket-extractor.service';
import { FlightTicketsService } from './flight-tickets.service';

@Module({
  imports: [AuthModule, MapsModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingDriverContactService,
    BookingRoutePlanService,
    FlightTicketExtractorService,
    FlightTicketsService
  ]
})
export class BookingsModule {}
