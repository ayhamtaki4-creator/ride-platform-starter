import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDirection, BookingType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import {
  BOOKING_MAX_LUGGAGE,
  BOOKING_MAX_PASSENGERS,
  BOOKING_MIN_LUGGAGE,
  BOOKING_MIN_PASSENGERS
} from '../../pricing/vehicle-class';

export class BookingQuoteDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'المسار الديناميكي المفضل' })
  @ValidateIf((dto: BookingQuoteDto) => !dto.direction)
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({ enum: BookingDirection, description: 'للتوافق مع نموذج الحجز القديم' })
  @ValidateIf((dto: BookingQuoteDto) => !dto.routeId)
  @IsEnum(BookingDirection)
  direction?: BookingDirection;

  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiProperty({
    example: 1,
    minimum: BOOKING_MIN_PASSENGERS,
    maximum: BOOKING_MAX_PASSENGERS
  })
  @Type(() => Number)
  @IsInt({ message: 'عدد الركاب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_PASSENGERS, { message: 'يجب أن يكون عدد الركاب راكبًا واحدًا على الأقل.' })
  @Max(BOOKING_MAX_PASSENGERS, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_PASSENGERS} راكبًا.`
  })
  passengerCount!: number;

  @ApiPropertyOptional({
    example: 2,
    minimum: BOOKING_MIN_LUGGAGE,
    maximum: BOOKING_MAX_LUGGAGE,
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد الحقائب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_LUGGAGE, { message: 'لا يمكن أن يكون عدد الحقائب سالبًا.' })
  @Max(BOOKING_MAX_LUGGAGE, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_LUGGAGE} حقيبة.`
  })
  luggageCount = 0;
}
