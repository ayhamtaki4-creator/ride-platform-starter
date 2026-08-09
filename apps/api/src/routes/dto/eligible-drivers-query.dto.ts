import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleClass } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { normalizeServiceDateInput } from '../../common/service-date';
import {
  BOOKING_MAX_LUGGAGE,
  BOOKING_MAX_PASSENGERS,
  BOOKING_MIN_LUGGAGE,
  BOOKING_MIN_PASSENGERS
} from '../../pricing/vehicle-class';

export class EligibleDriversQueryDto {
  @ApiProperty({
    example: '2026-08-15',
    description: 'تاريخ خدمة بصيغة YYYY-MM-DD. يتم تطبيع قيم ISO القديمة إلى تاريخ خدمة دمشق للتوافق مع العملاء السابقين.'
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return normalizeServiceDateInput(value) ?? value;
  })
  @IsDateString()
  travelDate!: string;

  @ApiPropertyOptional({ enum: VehicleClass, default: VehicleClass.SMALL })
  @IsOptional()
  @IsEnum(VehicleClass, { message: 'فئة السيارة غير صالحة.' })
  vehicleClass: VehicleClass = VehicleClass.SMALL;

  @ApiPropertyOptional({
    example: 1,
    minimum: BOOKING_MIN_PASSENGERS,
    maximum: BOOKING_MAX_PASSENGERS,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد الركاب يجب أن يكون رقمًا صحيحًا.' })
  @Min(BOOKING_MIN_PASSENGERS, { message: 'يجب أن يكون عدد الركاب راكبًا واحدًا على الأقل.' })
  @Max(BOOKING_MAX_PASSENGERS, {
    message: `الحد الأعلى للحجز الإلكتروني هو ${BOOKING_MAX_PASSENGERS} راكبًا.`
  })
  passengerCount = 1;

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
