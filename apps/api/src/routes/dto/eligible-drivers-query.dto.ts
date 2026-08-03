import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  BOOKING_MAX_LUGGAGE,
  BOOKING_MAX_PASSENGERS,
  BOOKING_MIN_LUGGAGE,
  BOOKING_MIN_PASSENGERS
} from '../../pricing/vehicle-class';

export class EligibleDriversQueryDto {
  @ApiProperty({ example: '2026-08-15T08:00:00.000Z' })
  @IsDateString()
  travelDate!: string;

  @ApiProperty({
    example: 2,
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

  @ApiPropertyOptional({ example: 'DAMASCUS', description: 'تصفية اختيارية حسب مركز تشغيل السائق والمركبة' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseRegionCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeOffline?: boolean;
}
