import { canonicalizeInternationalPhone, INTERNATIONAL_PHONE_MESSAGE, INTERNATIONAL_PHONE_PATTERN } from '../../common/phone';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleClass } from '@prisma/client';
import { Transform } from 'class-transformer';
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

export class AdminUpdateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => canonicalizeInternationalPhone(value))
  @Matches(INTERNATIONAL_PHONE_PATTERN, { message: INTERNATIONAL_PHONE_MESSAGE })
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  travelDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  flightArrivalTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  flightNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  passengerCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  luggageCount?: number;

  @ApiPropertyOptional({ enum: VehicleClass })
  @IsOptional()
  @IsEnum(VehicleClass)
  vehicleClass?: VehicleClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedFare?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(8)
  currency?: string;
}
