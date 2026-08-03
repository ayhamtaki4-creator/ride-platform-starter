import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDirection, BookingType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from 'class-validator';
import {
  BOOKING_MAX_LUGGAGE,
  BOOKING_MAX_PASSENGERS,
  BOOKING_MIN_LUGGAGE,
  BOOKING_MIN_PASSENGERS
} from '../../pricing/vehicle-class';

export class CreateBookingDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'المسار الديناميكي المفضل' })
  @ValidateIf((dto: CreateBookingDto) => !dto.direction)
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({ enum: BookingDirection, description: 'للتوافق مع الواجهة القديمة' })
  @ValidateIf((dto: CreateBookingDto) => !dto.routeId)
  @IsEnum(BookingDirection)
  direction?: BookingDirection;

  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  travelDate!: string;

  @ApiPropertyOptional({ example: '14:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  flightArrivalTime?: string;

  @ApiPropertyOptional({ example: 'ME 265' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  flightNumber?: string;

  @ApiProperty({
    example: 2,
    minimum: BOOKING_MIN_PASSENGERS,
    maximum: BOOKING_MAX_PASSENGERS
  })
  @IsInt({ message: 'عدد الركاب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_PASSENGERS, { message: 'يجب أن يكون عدد الركاب راكبًا واحدًا على الأقل.' })
  @Max(BOOKING_MAX_PASSENGERS, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_PASSENGERS} راكبًا.`
  })
  passengerCount!: number;

  @ApiProperty({
    example: 3,
    minimum: BOOKING_MIN_LUGGAGE,
    maximum: BOOKING_MAX_LUGGAGE
  })
  @IsInt({ message: 'عدد الحقائب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_LUGGAGE, { message: 'لا يمكن أن يكون عدد الحقائب سالبًا.' })
  @Max(BOOKING_MAX_LUGGAGE, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_LUGGAGE} حقيبة.`
  })
  luggageCount!: number;

  @ApiProperty({ example: 'مطار بيروت الدولي' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  pickupAddress!: string;

  @ApiProperty({ example: 'فندق الشام - دمشق' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  dropoffAddress!: string;

  @ApiProperty({ example: 'عمر حداد' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  passengerName!: string;

  @ApiProperty({ example: '+963944000000' })
  @IsString()
  @Matches(/^\+?[0-9][0-9\s-]{7,20}$/)
  passengerPhone!: string;

  @ApiPropertyOptional({ example: 'كرسي طفل عند الإمكان' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
