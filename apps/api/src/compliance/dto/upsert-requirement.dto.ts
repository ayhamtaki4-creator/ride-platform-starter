import { ComplianceSubject } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpsertRequirementDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  regionCode!: string;

  @IsEnum(ComplianceSubject)
  subject!: ComplianceSubject;

  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  documentType!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  minValidityDays?: number;

  @IsOptional()
  @IsBoolean()
  regionScoped?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
