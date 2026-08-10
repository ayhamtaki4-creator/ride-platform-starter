import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleClass } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import {
  BOOKING_MAX_LUGGAGE,
  BOOKING_MAX_PASSENGERS,
  BOOKING_MIN_LUGGAGE,
  BOOKING_MIN_PASSENGERS
} from '../../pricing/vehicle-class';

export class UpdateBookingDto {
  @ApiPropertyOptional({ example: '2026-08-18' })
  @IsOptional()
  @IsDateString()
  travelDate?: string;

  @ApiPropertyOptional({ example: '14:30', nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  flightArrivalTime?: string | null;

  @ApiPropertyOptional({ example: 'ME 265', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  flightNumber?: string | null;

  @ApiPropertyOptional({ enum: VehicleClass })
  @IsOptional()
  @IsEnum(VehicleClass, { message: 'فئة السيارة غير صالحة.' })
  vehicleClass?: VehicleClass;

  @ApiPropertyOptional({ minimum: BOOKING_MIN_PASSENGERS, maximum: BOOKING_MAX_PASSENGERS })
  @IsOptional()
  @IsInt({ message: 'عدد الركاب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_PASSENGERS)
  @Max(BOOKING_MAX_PASSENGERS)
  passengerCount?: number;

  @ApiPropertyOptional({ minimum: BOOKING_MIN_LUGGAGE, maximum: BOOKING_MAX_LUGGAGE })
  @IsOptional()
  @IsInt({ message: 'عدد الحقائب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_LUGGAGE)
  @Max(BOOKING_MAX_LUGGAGE)
  luggageCount?: number;

  @ApiPropertyOptional({ example: 'باب توما - دمشق' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  pickupAddress?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLatitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLongitude?: number;

  @ApiPropertyOptional({ example: 'مطار بيروت الدولي' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  dropoffAddress?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoffLatitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoffLongitude?: number;

  @ApiPropertyOptional({ example: 'عمر حداد' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  passengerName?: string;

  @ApiPropertyOptional({ example: '+963944000000' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9][0-9\s-]{7,20}$/)
  passengerPhone?: string;

  @ApiPropertyOptional({ nullable: true, example: 'تأخرت الرحلة الجوية' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ example: 'تغيير وقت الوصول بناءً على تحديث شركة الطيران' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
