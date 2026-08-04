import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiProperty()
  @IsBoolean()
  whatsappOptIn!: boolean;

  @ApiPropertyOptional({ example: '+963944000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}
