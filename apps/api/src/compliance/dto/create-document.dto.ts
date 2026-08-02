import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({ example: 'REGION_ENTRY_PERMIT' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  documentType!: string;

  @ApiProperty()
  @IsUUID()
  mediaAssetId!: string;

  @ApiPropertyOptional({ example: 'JORDAN' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  regionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  issuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
