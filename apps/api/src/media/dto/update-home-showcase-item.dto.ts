import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateHomeShowcaseItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(90)
  titleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitleAr?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
