import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMediaBrandingDto } from './dto/update-media-branding.dto';
import { MediaService } from './media.service';

type BrandingRow = {
  id: string;
  logoMediaAssetId: string | null;
  watermarkEnabled: boolean;
  plateBlurEnabled: boolean;
  watermarkOpacity: number;
  watermarkWidthPercent: number;
  updatedAt: Date;
  logoStatus: string | null;
  logoVisibility: string | null;
};

const DEFAULTS = {
  watermarkEnabled: true,
  plateBlurEnabled: true,
  watermarkOpacity: 0.72,
  watermarkWidthPercent: 18
};

@Injectable()
export class MediaBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService
  ) {}

  async get() {
    await this.ensureRow();
    const row = await this.readRow();
    return this.serialize(row);
  }

  async update(actor: AuthUser, dto: UpdateMediaBrandingDto) {
    await this.ensureRow();
    const current = await this.readRow();

    if (dto.logoMediaAssetId) {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.logoMediaAssetId }
      });
      if (!asset || asset.deletedAt || asset.status !== 'APPROVED') {
        throw new BadRequestException('يجب اعتماد ملف الشعار قبل استخدامه.');
      }
      if (asset.visibility !== 'PUBLIC' || !asset.mimeType.startsWith('image/')) {
        throw new BadRequestException('الشعار يجب أن يكون صورة عامة ومعتمدة.');
      }
    }

    const next = {
      logoMediaAssetId: dto.logoMediaAssetId ?? current.logoMediaAssetId,
      watermarkEnabled: dto.watermarkEnabled ?? current.watermarkEnabled,
      plateBlurEnabled: dto.plateBlurEnabled ?? current.plateBlurEnabled,
      watermarkOpacity: dto.watermarkOpacity ?? current.watermarkOpacity,
      watermarkWidthPercent: dto.watermarkWidthPercent ?? current.watermarkWidthPercent
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MediaBrandingSetting"
        SET
          "logoMediaAssetId" = ${next.logoMediaAssetId}::uuid,
          "watermarkEnabled" = ${next.watermarkEnabled},
          "plateBlurEnabled" = ${next.plateBlurEnabled},
          "watermarkOpacity" = ${next.watermarkOpacity},
          "watermarkWidthPercent" = ${next.watermarkWidthPercent},
          "updatedById" = ${actor.sub}::uuid,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'default'
      `);

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'media.branding.update',
          entityType: 'MediaBrandingSetting',
          entityId: 'default',
          metadata: next as unknown as Prisma.InputJsonValue
        }
      });
    });

    if (
      dto.logoMediaAssetId &&
      current.logoMediaAssetId &&
      current.logoMediaAssetId !== dto.logoMediaAssetId
    ) {
      await this.media.remove(actor, current.logoMediaAssetId).catch(() => undefined);
    }

    return this.get();
  }

  async removeLogo(actor: AuthUser) {
    await this.ensureRow();
    const current = await this.readRow();
    const oldLogoId = current.logoMediaAssetId;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MediaBrandingSetting"
        SET
          "logoMediaAssetId" = NULL,
          "watermarkEnabled" = FALSE,
          "updatedById" = ${actor.sub}::uuid,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'default'
      `);
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'media.branding.logo.remove',
          entityType: 'MediaBrandingSetting',
          entityId: 'default',
          metadata: { oldLogoMediaAssetId: oldLogoId }
        }
      });
    });

    if (oldLogoId) {
      await this.media.remove(actor, oldLogoId).catch(() => undefined);
    }
    return this.get();
  }

  async reset(actor: AuthUser) {
    await this.ensureRow();
    const current = await this.readRow();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MediaBrandingSetting"
        SET
          "watermarkEnabled" = ${Boolean(current.logoMediaAssetId)},
          "plateBlurEnabled" = ${DEFAULTS.plateBlurEnabled},
          "watermarkOpacity" = ${DEFAULTS.watermarkOpacity},
          "watermarkWidthPercent" = ${DEFAULTS.watermarkWidthPercent},
          "updatedById" = ${actor.sub}::uuid,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'default'
      `);
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'media.branding.reset',
          entityType: 'MediaBrandingSetting',
          entityId: 'default',
          metadata: DEFAULTS as unknown as Prisma.InputJsonValue
        }
      });
    });
    return this.get();
  }

  private async ensureRow() {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MediaBrandingSetting" ("id") VALUES ('default')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  private async readRow() {
    const rows = await this.prisma.$queryRaw<BrandingRow[]>(Prisma.sql`
      SELECT
        setting."id",
        setting."logoMediaAssetId",
        setting."watermarkEnabled",
        setting."plateBlurEnabled",
        setting."watermarkOpacity",
        setting."watermarkWidthPercent",
        setting."updatedAt",
        asset."status"::text AS "logoStatus",
        asset."visibility"::text AS "logoVisibility"
      FROM "MediaBrandingSetting" setting
      LEFT JOIN "MediaAsset" asset ON asset."id" = setting."logoMediaAssetId"
      WHERE setting."id" = 'default'
      LIMIT 1
    `);
    return rows[0];
  }

  private serialize(row: BrandingRow) {
    const logoReady = Boolean(
      row.logoMediaAssetId && row.logoStatus === 'APPROVED' && row.logoVisibility === 'PUBLIC'
    );
    return {
      id: row.id,
      logoMediaAssetId: row.logoMediaAssetId,
      logoPublicUrl: logoReady && row.logoMediaAssetId ? this.media.publicUrl(row.logoMediaAssetId) : null,
      watermarkEnabled: row.watermarkEnabled,
      plateBlurEnabled: row.plateBlurEnabled,
      watermarkOpacity: row.watermarkOpacity,
      watermarkWidthPercent: row.watermarkWidthPercent,
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
