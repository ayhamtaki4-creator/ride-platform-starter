import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateVehicleClassConfigDto {
  @ApiProperty({ example: 8, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt({ message: 'سعة السيارة يجب أن تكون رقمًا صحيحًا.' })
  @Min(1, { message: 'سعة السيارة يجب أن تكون شخصًا واحدًا على الأقل.' })
  @Max(30, { message: 'سعة السيارة لا يمكن أن تتجاوز 30 شخصًا.' })
  passengerCapacity!: number;

  @ApiProperty({ example: 4, minimum: 0, maximum: 30, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'سعة الحقائب يجب أن تكون رقمًا صحيحًا.' })
  @Min(0, { message: 'سعة الحقائب لا يمكن أن تكون سالبة.' })
  @Max(30, { message: 'سعة الحقائب لا يمكن أن تتجاوز 30 حقيبة.' })
  luggageCapacity?: number;
}
