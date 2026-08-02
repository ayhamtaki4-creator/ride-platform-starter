import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDirection, BookingType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf
} from 'class-validator';

export class CreateServiceRunDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'المسار الديناميكي المفضل' })
  @ValidateIf((dto: CreateServiceRunDto) => !dto.direction)
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({ enum: BookingDirection, description: 'للتوافق مع الرحلات القديمة' })
  @ValidateIf((dto: CreateServiceRunDto) => !dto.routeId)
  @IsEnum(BookingDirection)
  direction?: BookingDirection;

  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiProperty({ example: '2026-08-10T08:00:00.000Z' })
  @IsDateString()
  travelDate!: string;

  @ApiProperty()
  @IsUUID()
  driverId!: string;

  @ApiProperty()
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
