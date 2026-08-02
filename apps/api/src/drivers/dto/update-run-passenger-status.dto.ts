import { ApiProperty } from '@nestjs/swagger';
import { ServiceRunPassengerStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRunPassengerStatusDto {
  @ApiProperty({ enum: ServiceRunPassengerStatus })
  @IsEnum(ServiceRunPassengerStatus)
  status!: ServiceRunPassengerStatus;
}
