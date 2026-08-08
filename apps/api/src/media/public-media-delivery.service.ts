import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from './media.service';
import { R2ObjectStorageService } from './r2-object-storage.service';

@Injectable()
export class PublicMediaDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly r2: R2ObjectStorageService
  ) {}

  async resolve(id: string, variant?: string) {
    const resolvedId = await this.media.publicVariantAssetId(id, variant);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: resolvedId,
        status: 'APPROVED',
        visibility: 'PUBLIC',
        deletedAt: null
      },
      select: {
        id: true,
        storagePath: true
      }
    });

    if (!asset) {
      throw new NotFoundException('الصورة غير موجودة أو غير معتمدة.');
    }

    if (this.r2.enabled && this.r2.isR2Path(asset.storagePath)) {
      return {
        kind: 'redirect' as const,
        url: this.r2.signedGetUrl(asset.storagePath, 900)
      };
    }

    return {
      kind: 'stream' as const,
      file: await this.media.publicFile(asset.id)
    };
  }
}
