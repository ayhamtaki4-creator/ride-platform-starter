import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'DAMASCUS' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'دمشق' })
  @IsString()
  @MaxLength(120)
  nameAr!: string;

  @ApiPropertyOptional({ example: 'Damascus' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiProperty({ enum: LocationType })
  @IsEnum(LocationType)
  type!: LocationType;

  @ApiProperty({ example: 'SY' })
  @IsString()
  @MaxLength(2)
  countryCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  governorate?: string;

  @ApiPropertyOptional({ example: 33.5138 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 36.2765 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
