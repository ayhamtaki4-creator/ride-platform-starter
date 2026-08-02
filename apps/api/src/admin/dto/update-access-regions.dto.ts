import { ApiProperty } from '@nestjs/swagger';
import { AccessStatus } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class UpdateAccessRegionsDto {
  @ApiProperty({ type: [String], example: ['SYRIA', 'JORDAN'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  regionCodes!: string[];

  @ApiProperty({ enum: AccessStatus, default: AccessStatus.APPROVED })
  @IsOptional()
  @IsEnum(AccessStatus)
  status?: AccessStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
