import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Legacy refresh token body. Optional when HttpOnly refresh cookies are enabled.'
  })
  @IsOptional()
  @IsString()
  @MinLength(40)
  refreshToken?: string;
}
