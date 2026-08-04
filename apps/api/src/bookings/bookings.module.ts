import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { FlightTicketExtractorService } from './flight-ticket-extractor.service';
import { FlightTicketsService } from './flight-tickets.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, FlightTicketExtractorService, FlightTicketsService]
})
export class BookingsModule {}
