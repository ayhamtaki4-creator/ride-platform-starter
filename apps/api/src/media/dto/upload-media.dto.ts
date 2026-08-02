import { MediaPurpose, MediaVisibility } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class UploadMediaDto {
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @IsOptional()
  @IsEnum(MediaVisibility)
  visibility?: MediaVisibility;
}
