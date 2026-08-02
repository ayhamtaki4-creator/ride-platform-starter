import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min
} from 'class-validator';

export class UpdateDriverVehicleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  make!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  model!: string;

  @ApiProperty({ minimum: 1990, maximum: 2100 })
  @IsInt()
  @Min(1990)
  @Max(2100)
  year!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  color!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  plateNumber!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  seatCapacity!: number;

  @ApiPropertyOptional({ example: 'DAMASCUS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseRegionCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/vehicles/car.jpg' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  primaryImageUrl?: string;
}
