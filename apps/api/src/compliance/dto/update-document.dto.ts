import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  documentType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  regionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  documentNumber?: string;

  @IsOptional()
  @IsISO8601()
  issuedAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
