import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleClass } from '@prisma/client';
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
  @Matches(/^\+?[0-9][0-9\s-]{7,20}$/)
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
