import { ApiProperty } from '@nestjs/swagger';
import { DriverAvailability } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDriverAvailabilityDto {
  @ApiProperty({
    enum: [DriverAvailability.OFFLINE, DriverAvailability.ONLINE],
    example: DriverAvailability.ONLINE
  })
  @IsEnum(DriverAvailability)
  availability!: DriverAvailability;
}
