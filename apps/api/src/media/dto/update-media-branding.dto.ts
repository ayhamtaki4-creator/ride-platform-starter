import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class UpdateMediaBrandingDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  logoMediaAssetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  watermarkEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  plateBlurEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0.1, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  watermarkOpacity?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 40 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(40)
  watermarkWidthPercent?: number;
}
