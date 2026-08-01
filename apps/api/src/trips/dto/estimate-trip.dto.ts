import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class EstimateTripDto {
  @ApiProperty({ example: 33.324 })
  @IsLatitude()
  pickupLatitude!: number;

  @ApiProperty({ example: 44.421 })
  @IsLongitude()
  pickupLongitude!: number;

  @ApiProperty({ example: 33.315 })
  @IsLatitude()
  dropoffLatitude!: number;

  @ApiProperty({ example: 44.35 })
  @IsLongitude()
  dropoffLongitude!: number;
}
