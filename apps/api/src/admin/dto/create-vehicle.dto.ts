import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min
} from 'class-validator';

export class CreateVehicleDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  primaryImageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUrl({ require_protocol: true }, { each: true })
  imageUrls?: string[];

  @ApiProperty({ example: 'DAMASCUS' })
  @IsString()
  @MaxLength(80)
  baseRegionCode!: string;

  @ApiProperty({ type: [String], example: ['SYRIA', 'LEBANON'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  regionCodes!: string[];
}
