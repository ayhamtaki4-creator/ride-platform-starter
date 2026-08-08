import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateDriverProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'DAMASCUS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  baseRegionCode?: string;
}
