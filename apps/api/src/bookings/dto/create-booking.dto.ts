import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDirection, BookingType, VehicleClass } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
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
  @ApiPropertyOptional({ format: 'uuid', description: 'مفتاح منع إنشاء الحجز مرتين' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

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

  @ApiPropertyOptional({ enum: VehicleClass, default: VehicleClass.SMALL })
  @IsOptional()
  @IsEnum(VehicleClass, { message: 'فئة السيارة غير صالحة.' })
  vehicleClass: VehicleClass = VehicleClass.SMALL;

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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  flightTicketMediaId?: string;

  @ApiPropertyOptional({
    example: 1,
    minimum: BOOKING_MIN_PASSENGERS,
    maximum: BOOKING_MAX_PASSENGERS,
    default: 1,
    description: 'للتوافق مع حجوزات المقاعد المشتركة والعملاء القدامى'
  })
  @IsOptional()
  @IsInt({ message: 'عدد الركاب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_PASSENGERS, { message: 'يجب أن يكون عدد الركاب راكبًا واحدًا على الأقل.' })
  @Max(BOOKING_MAX_PASSENGERS, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_PASSENGERS} راكبًا.`
  })
  passengerCount = 1;

  @ApiPropertyOptional({
    example: 0,
    minimum: BOOKING_MIN_LUGGAGE,
    maximum: BOOKING_MAX_LUGGAGE,
    default: 0,
    description: 'للتوافق مع الحجوزات القديمة فقط'
  })
  @IsOptional()
  @IsInt({ message: 'عدد الحقائب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_LUGGAGE, { message: 'لا يمكن أن يكون عدد الحقائب سالبًا.' })
  @Max(BOOKING_MAX_LUGGAGE, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_LUGGAGE} حقيبة.`
  })
  luggageCount = 0;

  @ApiProperty({ example: 'مطار بيروت الدولي' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  pickupAddress!: string;

  @ApiPropertyOptional({ example: 33.5138, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط عرض نقطة الانطلاق غير صالح.' })
  @Min(-90, { message: 'خط عرض نقطة الانطلاق غير صالح.' })
  @Max(90, { message: 'خط عرض نقطة الانطلاق غير صالح.' })
  pickupLatitude?: number;

  @ApiPropertyOptional({ example: 36.2765, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط طول نقطة الانطلاق غير صالح.' })
  @Min(-180, { message: 'خط طول نقطة الانطلاق غير صالح.' })
  @Max(180, { message: 'خط طول نقطة الانطلاق غير صالح.' })
  pickupLongitude?: number;

  @ApiProperty({ example: 'فندق الشام - دمشق' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  dropoffAddress!: string;

  @ApiPropertyOptional({ example: 33.8209, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط عرض نقطة الوصول غير صالح.' })
  @Min(-90, { message: 'خط عرض نقطة الوصول غير صالح.' })
  @Max(90, { message: 'خط عرض نقطة الوصول غير صالح.' })
  dropoffLatitude?: number;

  @ApiPropertyOptional({ example: 35.4884, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط طول نقطة الوصول غير صالح.' })
  @Min(-180, { message: 'خط طول نقطة الوصول غير صالح.' })
  @Max(180, { message: 'خط طول نقطة الوصول غير صالح.' })
  dropoffLongitude?: number;

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
