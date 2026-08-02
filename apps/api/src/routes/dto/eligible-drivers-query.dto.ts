import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class EligibleDriversQueryDto {
  @ApiProperty({ example: '2026-08-15T08:00:00.000Z' })
  @IsDateString()
  travelDate!: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  passengerCount!: number;

  @ApiPropertyOptional({ example: 'DAMASCUS', description: 'تصفية اختيارية حسب مركز تشغيل السائق والمركبة' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseRegionCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeOffline?: boolean;
}
