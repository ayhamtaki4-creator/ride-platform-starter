import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegionKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class CreateRegionDto {
  @ApiProperty({ example: 'JORDAN' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'الأردن' })
  @IsString()
  @MaxLength(120)
  nameAr!: string;

  @ApiPropertyOptional({ example: 'Jordan' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiProperty({ example: 'JO' })
  @IsString()
  @MaxLength(2)
  countryCode!: string;

  @ApiProperty({ enum: RegionKind })
  @IsEnum(RegionKind)
  kind!: RegionKind;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
