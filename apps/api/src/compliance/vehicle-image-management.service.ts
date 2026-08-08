import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehicleImageManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService
  ) {}

  async setPrimary(actor: AuthUser, driverId: string, vehicleId: string, imageId: string) {
    const image = await this.prisma.vehicleImage.findFirst({
      where: {
        id: imageId,
        vehicleId,
        vehicle: { driverProfile: { userId: driverId } }
      },
      include: {
        mediaAsset: {
          select: { id: true, status: true, deletedAt: true }
        }
      }
    });

    if (!image) {
      throw new NotFoundException('صورة المركبة غير موجودة لهذا السائق.');
    }
    if (
      !image.isApproved ||
      !image.mediaAsset ||
      image.mediaAsset.status !== 'APPROVED' ||
      image.mediaAsset.deletedAt
    ) {
      throw new BadRequestException('يجب اعتماد الصورة قبل تعيينها كصورة رئيسية.');
    }

    const mediaAssetId = image.mediaAsset.id;
    const publicUrl = this.media.publicUrl(mediaAssetId);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleImage.updateMany({
        where: { vehicleId, isPrimary: true },
        data: { isPrimary: false }
      });
      await tx.vehicleImage.update({
        where: { id: image.id },
        data: { isPrimary: true }
      });
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          primaryImageMediaId: mediaAssetId,
          primaryImageUrl: publicUrl
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'vehicle.image.primary',
          entityType: 'VehicleImage',
          entityId: image.id,
          metadata: { driverId, vehicleId, mediaAssetId }
        }
      });
    });

    return {
      id: image.id,
      vehicleId,
      isPrimary: true,
      url: publicUrl
    };
  }
}
