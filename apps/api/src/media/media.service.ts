import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaPurpose, MediaVisibility, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UploadMediaDto } from './dto/upload-media.dto';

export interface UploadedMediaFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

const IMAGE_PURPOSES: MediaPurpose[] = ['DRIVER_AVATAR', 'VEHICLE_IMAGE'];
const DOCUMENT_PURPOSES: MediaPurpose[] = ['DRIVER_DOCUMENT', 'VEHICLE_DOCUMENT'];

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly root: string;
  private readonly maxBytes: number;
  private readonly publicApiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    const configuredRoot = this.config.get<string>('MEDIA_STORAGE_ROOT') ?? './storage/media';
    this.root = resolve(process.cwd(), configuredRoot);
    const maxMb = Number(this.config.get<string>('MEDIA_MAX_FILE_MB') ?? '10');
    this.maxBytes = Math.max(1, Number.isFinite(maxMb) ? maxMb : 10) * 1024 * 1024;
    this.publicApiUrl = (
      this.config.get<string>('PUBLIC_API_URL') ?? `http://localhost:${this.config.get<number>('PORT', 4000)}`
    ).replace(/\/$/, '');
  }

  async onModuleInit() {
    await mkdir(this.root, { recursive: true });
  }

  publicUrl(id: string) {
    return `${this.publicApiUrl}/api/media/public/${id}`;
  }

  adminFileUrl(id: string) {
    return `${this.publicApiUrl}/api/admin/media/${id}/file`;
  }

  async upload(actor: AuthUser, file: UploadedMediaFile | undefined, dto: UploadMediaDto) {
    if (!file?.buffer?.length) throw new BadRequestException('يجب اختيار ملف للرفع.');
    if (file.size <= 0 || file.size > this.maxBytes) {
      throw new BadRequestException(`حجم الملف يجب ألا يتجاوز ${Math.round(this.maxBytes / 1024 / 1024)} ميغابايت.`);
    }

    const extension = MIME_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException('نوع الملف غير مدعوم. المسموح: JPG, PNG, WEBP, PDF.');
    }
    const detectedMime = this.detectMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw new BadRequestException('محتوى الملف لا يطابق نوعه المعلن.');
    }
    if (IMAGE_PURPOSES.includes(dto.purpose) && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('صورة السائق أو المركبة يجب أن تكون ملف صورة.');
    }
    if (DOCUMENT_PURPOSES.includes(dto.purpose) && ![...Object.keys(MIME_EXTENSIONS)].includes(file.mimetype)) {
      throw new BadRequestException('صيغة الوثيقة غير مدعومة.');
    }

    const visibility = DOCUMENT_PURPOSES.includes(dto.purpose)
      ? MediaVisibility.PRIVATE
      : dto.visibility ?? MediaVisibility.PUBLIC;
    const storedName = `${randomUUID()}${extension}`;
    const storagePath = resolve(this.root, storedName);
    if (!storagePath.startsWith(this.root)) throw new BadRequestException('مسار التخزين غير صالح.');

    await writeFile(storagePath, file.buffer, { flag: 'wx' });
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    try {
      const asset = await this.prisma.mediaAsset.create({
        data: {
          originalName: basename(file.originalname || storedName),
          storedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256,
          storagePath,
          purpose: dto.purpose,
          visibility,
          uploadedById: actor.sub
        }
      });
      await this.audit(actor, 'media.upload', asset.id, {
        purpose: asset.purpose,
        visibility: asset.visibility,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256
      });
      return this.serialize(asset);
    } catch (error) {
      await unlink(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async list(status?: string, purpose?: string) {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
        ...(purpose ? { purpose: purpose as never } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } }
      }
    });
    return assets.map((asset) => this.serialize(asset));
  }

  async approve(actor: AuthUser, id: string) {
    const asset = await this.getExisting(id);
    if (asset.status === 'DELETED') throw new ConflictException('الملف محذوف.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.mediaAsset.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: actor.sub,
          approvedAt: new Date(),
          rejectedAt: null,
          rejectionReason: null
        }
      });
      const publicUrl = this.publicUrl(id);
      await tx.driverProfile.updateMany({
        where: { avatarMediaId: id },
        data: { avatarUrl: publicUrl }
      });
      await tx.vehicle.updateMany({
        where: { primaryImageMediaId: id },
        data: { primaryImageUrl: publicUrl }
      });
      await tx.vehicleImage.updateMany({
        where: { mediaAssetId: id },
        data: { url: publicUrl, isApproved: true }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'media.approve',
          entityType: 'MediaAsset',
          entityId: id,
          metadata: { purpose: approved.purpose }
        }
      });
      return approved;
    });
    return this.serialize(updated);
  }

  async reject(actor: AuthUser, id: string, reason: string) {
    const asset = await this.getExisting(id);
    if (asset.status === 'DELETED') throw new ConflictException('الملف محذوف.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const rejected = await tx.mediaAsset.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedById: actor.sub,
          approvedAt: null,
          rejectedAt: new Date(),
          rejectionReason: reason.trim()
        }
      });
      await tx.driverProfile.updateMany({
        where: { avatarMediaId: id },
        data: { avatarUrl: null }
      });
      await tx.vehicle.updateMany({
        where: { primaryImageMediaId: id },
        data: { primaryImageUrl: null }
      });
      await tx.vehicleImage.updateMany({
        where: { mediaAssetId: id },
        data: { isApproved: false }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'media.reject',
          entityType: 'MediaAsset',
          entityId: id,
          metadata: { reason: reason.trim() }
        }
      });
      return rejected;
    });
    return this.serialize(updated);
  }

  async remove(actor: AuthUser, id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: { driverDocument: true, vehicleDocument: true }
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('الملف غير موجود.');
    if (asset.driverDocument || asset.vehicleDocument) {
      throw new ConflictException('لا يمكن حذف ملف مرتبط بوثيقة. ارفض الوثيقة أو استبدلها أولًا.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.updateMany({
        where: { avatarMediaId: id },
        data: { avatarMediaId: null, avatarUrl: null }
      });
      await tx.vehicle.updateMany({
        where: { primaryImageMediaId: id },
        data: { primaryImageMediaId: null, primaryImageUrl: null }
      });
      await tx.vehicleImage.deleteMany({ where: { mediaAssetId: id } });
      await tx.mediaAsset.update({
        where: { id },
        data: { status: 'DELETED', deletedAt: new Date() }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'media.delete',
          entityType: 'MediaAsset',
          entityId: id
        }
      });
    });
    await unlink(asset.storagePath).catch(() => undefined);
    return { success: true };
  }

  async publicFile(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id,
        status: 'APPROVED',
        visibility: 'PUBLIC',
        deletedAt: null
      }
    });
    if (!asset) throw new NotFoundException('الصورة غير موجودة أو غير معتمدة.');
    return this.fileResult(asset);
  }

  async adminFile(id: string) {
    const asset = await this.getExisting(id);
    return this.fileResult(asset);
  }

  async assertAsset(
    id: string,
    expectedPurpose: MediaPurpose,
    expectedVisibility?: MediaVisibility,
    tx: Prisma.TransactionClient | PrismaService = this.prisma
  ) {
    const client = tx as Prisma.TransactionClient;
    const asset = await client.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt || asset.status === 'DELETED') {
      throw new NotFoundException('ملف الوسائط غير موجود.');
    }
    if (asset.purpose !== expectedPurpose) {
      throw new BadRequestException(`غرض الملف لا يطابق ${expectedPurpose}.`);
    }
    if (expectedVisibility && asset.visibility !== expectedVisibility) {
      throw new BadRequestException('خصوصية الملف غير متوافقة مع الاستخدام المطلوب.');
    }
    return asset;
  }

  private async getExisting(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('الملف غير موجود.');
    return asset;
  }

  private fileResult(asset: { storagePath: string; mimeType: string; originalName: string; sizeBytes: number }) {
    return {
      stream: createReadStream(asset.storagePath),
      mimeType: asset.mimeType,
      originalName: asset.originalName,
      sizeBytes: asset.sizeBytes
    };
  }

  private serialize<T extends { id: string; visibility: string; status: string; deletedAt?: Date | null }>(asset: T) {
    return {
      ...asset,
      publicUrl:
        asset.visibility === 'PUBLIC' && asset.status === 'APPROVED' && !asset.deletedAt
          ? this.publicUrl(asset.id)
          : null,
      adminFileUrl: this.adminFileUrl(asset.id)
    };
  }

  private detectMime(buffer: Buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    return null;
  }

  private audit(actor: AuthUser, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action,
        entityType: 'MediaAsset',
        entityId,
        metadata
      }
    });
  }
}
