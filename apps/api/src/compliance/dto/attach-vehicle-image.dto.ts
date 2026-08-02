import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AttachVehicleImageDto {
  @IsUUID()
  mediaAssetId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}
