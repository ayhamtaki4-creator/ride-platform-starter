import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { FlightTicketExtractorService } from './flight-ticket-extractor.service';
import { FlightTicketsService } from './flight-tickets.service';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController],
  providers: [BookingsService, FlightTicketExtractorService, FlightTicketsService]
})
export class BookingsModule {}
