import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class CreateDriverDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @ApiPropertyOptional({ example: 'SY-DL-102030' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  licenseNumber?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/drivers/ahmad.jpg' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'DAMASCUS', default: 'DAMASCUS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseRegionCode?: string;

  @ApiPropertyOptional({ type: [String], example: ['SYRIA', 'JORDAN'], default: ['SYRIA'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  driverRegionCodes?: string[];

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

  @ApiProperty({ minimum: 1, maximum: 20, default: 4 })
  @IsInt()
  @Min(1)
  @Max(20)
  seatCapacity!: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/vehicles/h1-front.jpg' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  primaryImageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUrl({ require_protocol: true }, { each: true })
  vehicleImageUrls?: string[];

  @ApiPropertyOptional({ example: 'DAMASCUS', description: 'مركز المركبة التشغيلي؛ يستخدم مركز السائق عند عدم الإرسال.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleBaseRegionCode?: string;

  @ApiPropertyOptional({ type: [String], example: ['SYRIA', 'JORDAN'], default: ['SYRIA'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  vehicleRegionCodes?: string[];
}
