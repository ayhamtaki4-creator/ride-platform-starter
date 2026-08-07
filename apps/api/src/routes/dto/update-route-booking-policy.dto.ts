import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateRouteBookingPolicyDto {
  @ApiPropertyOptional({ description: 'السماح للمسافر بتغيير نقطة الانطلاق الدقيقة' })
  @IsOptional()
  @IsBoolean()
  passengerCanEditPickup?: boolean;

  @ApiPropertyOptional({ description: 'السماح للمسافر بتغيير نقطة الوصول الدقيقة' })
  @IsOptional()
  @IsBoolean()
  passengerCanEditDropoff?: boolean;

  @ApiPropertyOptional({ enum: ['ARRIVAL', 'DEPARTURE'] })
  @IsOptional()
  @IsIn(['ARRIVAL', 'DEPARTURE'])
  flightTimeMode?: 'ARRIVAL' | 'DEPARTURE';
}
