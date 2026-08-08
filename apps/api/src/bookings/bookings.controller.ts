import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { UploadedMediaFile } from '../media/media.service';
import { BookingDriverContactService } from './booking-driver-contact.service';
import { BookingRoutePlanService } from './booking-route-plan.service';
import { BookingsService } from './bookings.service';
import { BookingQuoteDto } from './dto/booking-quote.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { FlightTicketsService } from './flight-tickets.service';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly flightTickets: FlightTicketsService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly driverContact: BookingDriverContactService,
    private readonly routePlans: BookingRoutePlanService
  ) {}

  @Public()
  @Get('quote')
  quote(@Query() dto: BookingQuoteDto) {
    return this.bookingsService.quote(dto);
  }

  @ApiBearerAuth()
  @Permissions('booking:create')
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    const booking = await this.bookingsService.create(user, dto);
    void this.routePlans.syncPendingBooking(booking.id);
    return booking;
  }

  @ApiBearerAuth()
  @Permissions('booking:read:own')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.bookingsService.mine(user);
  }

  @Public()
  @Post('flight-ticket/analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 }
    })
  )
  async analyzeFlightTicket(
    @Ip() ipAddress: string | undefined,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @Body('routeId') routeId?: string
  ) {
    await this.rateLimit.assertTicketAnalysisAllowed(ipAddress);
    return this.flightTickets.analyze(file, routeId);
  }

  @ApiBearerAuth()
  @Permissions('booking:create')
  @Post('flight-ticket')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 }
    })
  )
  uploadFlightTicket(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @Body('routeId') routeId?: string
  ) {
    return this.flightTickets.uploadAndExtract(user, file, routeId);
  }

  @ApiBearerAuth()
  @Permissions('booking:read:own')
  @Get(':id/driver-contact')
  driverContactForPassenger(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string
  ) {
    return this.driverContact.getForPassenger(user, id);
  }

  @ApiBearerAuth()
  @Get(':id/flight-ticket')
  async flightTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const file = await this.bookingsService.flightTicketFile(user, id);
    response.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': 'private, no-store'
    });
    return new StreamableFile(file.stream);
  }
}
