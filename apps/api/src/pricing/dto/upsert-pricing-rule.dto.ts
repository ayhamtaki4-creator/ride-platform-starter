import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDirection, BookingType, VehicleClass } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf
} from 'class-validator';

export class UpsertPricingRuleDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'المسار الديناميكي المفضل' })
  @ValidateIf((dto: UpsertPricingRuleDto) => !dto.direction)
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({ enum: BookingDirection, description: 'للتوافق مع الاتجاهات القديمة فقط' })
  @ValidateIf((dto: UpsertPricingRuleDto) => !dto.routeId)
  @IsEnum(BookingDirection)
  direction?: BookingDirection;

  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiPropertyOptional({ enum: VehicleClass, default: VehicleClass.SMALL })
  @IsOptional()
  @IsEnum(VehicleClass)
  vehicleClass: VehicleClass = VehicleClass.SMALL;

  @ApiProperty({ example: 40 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  passengerPrice!: number;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  driverFee!: number;

  @ApiProperty({ example: 15 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  platformMargin!: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
