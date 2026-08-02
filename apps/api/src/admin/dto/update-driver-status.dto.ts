import { ApiProperty } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDriverStatusDto {
  @ApiProperty({ enum: DriverStatus })
  @IsEnum(DriverStatus)
  status!: DriverStatus;
}
