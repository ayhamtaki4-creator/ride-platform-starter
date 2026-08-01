import { ApiProperty } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

export class CreateTripDto {
  @ApiProperty({ example: 'شارع فلسطين، بغداد' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  pickupAddress!: string;

  @ApiProperty({ example: 33.324 })
  @IsLatitude()
  pickupLatitude!: number;

  @ApiProperty({ example: 44.421 })
  @IsLongitude()
  pickupLongitude!: number;

  @ApiProperty({ example: 'المنصور، بغداد' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  dropoffAddress!: string;

  @ApiProperty({ example: 33.315 })
  @IsLatitude()
  dropoffLatitude!: number;

  @ApiProperty({ example: 44.35 })
  @IsLongitude()
  dropoffLongitude!: number;
}
