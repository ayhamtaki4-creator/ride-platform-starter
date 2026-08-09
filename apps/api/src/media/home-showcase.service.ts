import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaPurpose, MediaStatus, MediaVisibility, Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateHomeShowcaseItemDto } from './dto/update-home-showcase-item.dto';
import { MediaService } from './media.service';

type ShowcaseConfig = {
  titleAr: string;
  subtitleAr: string;
  sortOrder: number;
  isActive: boolean;
};

@Injectable()
export class HomeShowcaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService
  ) {}

  async publicList() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        purpose: MediaPurpose.OTHER,
        visibility: MediaVisibility.PUBLIC,
        status: MediaStatus.APPROVED,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' },
      take: 120
    });

    const entries = assets.flatMap((asset) => {
      const config = this.readShowcase(asset.metadata);
      return config?.isActive ? [{ asset, config }] : [];
    });

    return entries
      .sort(
        (a, b) =>
          a.config.sortOrder - b.config.sortOrder ||
          a.asset.createdAt.getTime() - b.asset.createdAt.getTime()
      )
      .map(({ asset, config }) => this.serialize(asset.id, config));
  }

  async adminList() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        purpose: MediaPurpose.OTHER,
        visibility: MediaVisibility.PUBLIC,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    const entries = assets.flatMap((asset) => {
      const config = this.readShowcase(asset.metadata);
      return config ? [{ asset, config }] : [];
    });

    return entries
      .sort(
        (a, b) =>
          a.config.sortOrder - b.config.sortOrder ||
          a.asset.createdAt.getTime() - b.asset.createdAt.getTime()
      )
      .map(({ asset, config }) => ({
        ...this.serialize(asset.id, config),
        status: asset.status,
        originalName: asset.originalName,
        adminFileUrl: this.media.adminFileUrl(asset.id)
      }));
  }

  async attach(actor: AuthUser, id: string, dto: UpdateHomeShowcaseItemDto) {
    const asset = await this.getEligibleAsset(id);
    if (asset.status !== MediaStatus.APPROVED) await this.media.approve(actor, id);
    return this.save(actor, id, asset.metadata, dto, true);
  }

  async update(actor: AuthUser, id: string, dto: UpdateHomeShowcaseItemDto) {
    const asset = await this.getEligibleAsset(id);
    const current = this.readShowcase(asset.metadata);
    if (!current) throw new NotFoundException('الصورة غير مضافة إلى معرض الصفحة الرئيسية.');
    return this.save(actor, id, asset.metadata, dto, false);
  }

  private async save(
    actor: AuthUser,
    id: string,
    metadata: Prisma.JsonValue | null,
    dto: UpdateHomeShowcaseItemDto,
    isNew: boolean
  ) {
    const existingRoot = this.jsonObject(metadata);
    const current = this.readShowcase(metadata);
    const next: ShowcaseConfig = {
      titleAr: dto.titleAr?.trim() || current?.titleAr || 'سيارة من أسطول طريق الشام',
      subtitleAr:
        dto.subtitleAr?.trim() ||
        current?.subtitleAr ||
        'سيارات حديثة ومكيفة ومجهزة لرحلات المسافات الطويلة.',
      sortOrder: dto.sortOrder ?? current?.sortOrder ?? 0,
      isActive: dto.isActive ?? current?.isActive ?? true
    };
    const showcaseMetadata: Prisma.InputJsonObject = {
      titleAr: next.titleAr,
      subtitleAr: next.subtitleAr,
      sortOrder: next.sortOrder,
      isActive: next.isActive
    };
    const combinedMetadata = {
      ...existingRoot,
      homeShowcase: showcaseMetadata
    } as Prisma.InputJsonObject;

    await this.prisma.$transaction([
      this.prisma.mediaAsset.update({
        where: { id },
        data: {
          visibility: MediaVisibility.PUBLIC,
          metadata: combinedMetadata
        }
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: actor.sub,
          action: isNew ? 'home_showcase.attach' : 'home_showcase.update',
          entityType: 'MediaAsset',
          entityId: id,
          metadata: showcaseMetadata
        }
      })
    ]);

    return this.serialize(id, next);
  }

  private async getEligibleAsset(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null }
    });
    if (!asset) throw new NotFoundException('الصورة غير موجودة.');
    if (asset.purpose !== MediaPurpose.OTHER || !asset.mimeType.startsWith('image/')) {
      throw new BadRequestException('معرض الصفحة الرئيسية يقبل صورًا عامة مخصصة للعرض فقط.');
    }
    return asset;
  }

  private serialize(id: string, config: ShowcaseConfig) {
    return {
      id,
      titleAr: config.titleAr,
      subtitleAr: config.subtitleAr,
      sortOrder: config.sortOrder,
      isActive: config.isActive,
      imageUrl: this.media.publicUrl(id)
    };
  }

  private readShowcase(metadata: Prisma.JsonValue | null): ShowcaseConfig | null {
    const root = this.jsonObject(metadata);
    const candidate = root.homeShowcase;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const value = candidate as Prisma.JsonObject;
    const titleAr = typeof value.titleAr === 'string' ? value.titleAr.trim() : '';
    const subtitleAr = typeof value.subtitleAr === 'string' ? value.subtitleAr.trim() : '';
    const sortOrder =
      typeof value.sortOrder === 'number' && Number.isFinite(value.sortOrder)
        ? value.sortOrder
        : 0;
    const isActive = typeof value.isActive === 'boolean' ? value.isActive : true;
    return {
      titleAr: titleAr || 'سيارة من أسطول طريق الشام',
      subtitleAr: subtitleAr || 'سيارات حديثة ومكيفة ومجهزة لرحلات المسافات الطويلة.',
      sortOrder,
      isActive
    };
  }

  private jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Prisma.JsonObject)
      : {};
  }
}
