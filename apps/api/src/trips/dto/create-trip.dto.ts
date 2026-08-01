import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateTripDto {
  @ApiProperty({ example: 'شارع فلسطين، بغداد' })
  @IsString()
  pickupAddress!: string;

  @ApiProperty({ example: 33.324 })
  @IsLatitude()
  pickupLatitude!: number;

  @ApiProperty({ example: 44.421 })
  @IsLongitude()
  pickupLongitude!: number;

  @ApiProperty({ example: 'المنصور، بغداد' })
  @IsString()
  dropoffAddress!: string;

  @ApiProperty({ example: 33.315 })
  @IsLatitude()
  dropoffLatitude!: number;

  @ApiProperty({ example: 44.350 })
  @IsLongitude()
  dropoffLongitude!: number;

  @ApiProperty({ example: 12000 })
  @IsNumber()
  @IsPositive()
  estimatedFare!: number;
}
