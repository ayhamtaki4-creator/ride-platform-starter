import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from 'class-validator';

export class CreateRouteDto {
  @ApiProperty({ example: 'DAM-AMM' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'دمشق إلى عمّان' })
  @IsString()
  @MaxLength(160)
  nameAr!: string;

  @ApiPropertyOptional({ example: 'Damascus to Amman' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  originId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  destinationId!: string;

  @ApiProperty({ enum: RouteType })
  @IsEnum(RouteType)
  routeType!: RouteType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresFlightDetails?: boolean;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ example: 210 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  distanceKm?: number;

  @ApiProperty({ type: [String], example: ['SYRIA', 'JORDAN'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  requiredRegionCodes!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
