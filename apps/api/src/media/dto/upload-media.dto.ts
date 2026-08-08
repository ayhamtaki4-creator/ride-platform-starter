import { MediaPurpose, MediaVisibility } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';

export class UploadMediaDto {
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @IsOptional()
  @IsEnum(MediaVisibility)
  visibility?: MediaVisibility;

  @IsOptional()
  @IsUUID()
  variantOfId?: string;

  @IsOptional()
  @IsIn(['ORIGINAL', 'DISPLAY', 'THUMBNAIL'])
  variantKind?: 'ORIGINAL' | 'DISPLAY' | 'THUMBNAIL';
}
