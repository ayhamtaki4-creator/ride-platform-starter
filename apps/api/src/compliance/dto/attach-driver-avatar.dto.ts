import { IsUUID } from 'class-validator';

export class AttachDriverAvatarDto {
  @IsUUID()
  mediaAssetId!: string;
}
