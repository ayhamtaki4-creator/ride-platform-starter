import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ComplianceSubject,
  DocumentStatus,
  MediaPurpose,
  MediaVisibility,
  Prisma
} from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachVehicleImageDto } from './dto/attach-vehicle-image.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UpsertRequirementDto } from './dto/upsert-requirement.dto';

type DbClient = Prisma.TransactionClient | PrismaService;

type RequirementLike = {
  regionId: string;
  subject: string;
  documentType: string;
  minValidityDays: number;
  regionScoped: boolean;
  region?: { code: string; nameAr: string };
};

type DocumentLike = {
  documentType: string;
  regionId: string | null;
  status: string;
  expiresAt: Date | null;
};

@Injectable()
export class ComplianceService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    const minutes = Math.max(
      5,
      Number(this.config.get<string>('COMPLIANCE_EXPIRY_CHECK_MINUTES') ?? '60') || 60
    );
    void this.refreshExpiredDocuments();
    this.timer = setInterval(() => void this.refreshExpiredDocuments(), minutes * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  listRequirements() {
    return this.prisma.regionDocumentRequirement.findMany({
      orderBy: [
        { region: { countryCode: 'asc' } },
        { region: { code: 'asc' } },
        { subject: 'asc' },
        { documentType: 'asc' }
      ],
      include: { region: true }
    });
  }

  async upsertRequirement(actor: AuthUser, dto: UpsertRequirementDto) {
    const region = await this.resolveRegion(dto.regionCode);
    const documentType = this.normalizeDocumentType(dto.documentType);
    const requirement = await this.prisma.regionDocumentRequirement.upsert({
      where: {
        regionId_subject_documentType: {
          regionId: region.id,
          subject: dto.subject,
          documentType
        }
      },
      update: {
        minValidityDays: dto.minValidityDays ?? 0,
        regionScoped: dto.regionScoped ?? false,
        isActive: dto.isActive ?? true
      },
      create: {
        regionId: region.id,
        subject: dto.subject,
        documentType,
        minValidityDays: dto.minValidityDays ?? 0,
        regionScoped: dto.regionScoped ?? false,
        isActive: dto.isActive ?? true
      },
      include: { region: true }
    });
    await this.audit(actor, 'compliance.requirement.upsert', 'RegionDocumentRequirement', requirement.id, {
      regionCode: region.code,
      subject: requirement.subject,
      documentType,
      minValidityDays: requirement.minValidityDays,
      regionScoped: requirement.regionScoped,
      isActive: requirement.isActive
    });
    return requirement;
  }

  async listDriverDocuments(driverId: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      select: { id: true }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');
    return this.prisma.driverDocument.findMany({
      where: { driverProfileId: profile.id },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
      include: {
        region: true,
        mediaAsset: true,
        reviewedBy: { select: { id: true, firstName: true, lastName: true } }
      }
    });
  }

  async createDriverDocument(actor: AuthUser, driverId: string, dto: CreateDocumentDto) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      select: { id: true }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');
    const region = dto.regionCode ? await this.resolveRegion(dto.regionCode) : null;
    const dates = this.parseDates(dto.issuedAt, dto.expiresAt);

    const document = await this.prisma.$transaction(async (tx) => {
      await this.media.assertAsset(
        dto.mediaAssetId,
        MediaPurpose.DRIVER_DOCUMENT,
        MediaVisibility.PRIVATE,
        tx
      );
      const created = await tx.driverDocument.create({
        data: {
          driverProfileId: profile.id,
          mediaAssetId: dto.mediaAssetId,
          regionId: region?.id ?? null,
          documentType: this.normalizeDocumentType(dto.documentType),
          documentNumber: dto.documentNumber?.trim() || null,
          issuedAt: dates.issuedAt,
          expiresAt: dates.expiresAt,
          notes: dto.notes?.trim() || null
        },
        include: { region: true, mediaAsset: true }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.document.create',
          entityType: 'DriverDocument',
          entityId: created.id,
          metadata: {
            driverId,
            documentType: created.documentType,
            regionCode: region?.code ?? null,
            expiresAt: created.expiresAt?.toISOString() ?? null
          }
        }
      });
      return created;
    });
    return document;
  }

  async updateDriverDocument(actor: AuthUser, driverId: string, documentId: string, dto: UpdateDocumentDto) {
    const current = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverProfile: { userId: driverId } }
    });
    if (!current) throw new NotFoundException('وثيقة السائق غير موجودة.');
    const region = dto.regionCode ? await this.resolveRegion(dto.regionCode) : undefined;
    const dates = this.parseDates(dto.issuedAt, dto.expiresAt, true);
    return this.prisma.$transaction(async (tx) => {
      await this.syncDriverRegionAccess(tx, current, 'PENDING');
      const updated = await tx.driverDocument.update({
        where: { id: current.id },
        data: {
          ...(dto.documentType ? { documentType: this.normalizeDocumentType(dto.documentType) } : {}),
          ...(region ? { regionId: region.id } : {}),
          ...(dto.documentNumber !== undefined ? { documentNumber: dto.documentNumber.trim() || null } : {}),
          ...(dates.issuedAt !== undefined ? { issuedAt: dates.issuedAt } : {}),
          ...(dates.expiresAt !== undefined ? { expiresAt: dates.expiresAt } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          status: 'PENDING',
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null
        },
        include: { region: true, mediaAsset: true }
      });
      await tx.mediaAsset.update({
        where: { id: current.mediaAssetId },
        data: {
          status: 'PENDING',
          approvedById: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null
        }
      });
      await this.syncDriverRegionAccess(tx, updated, 'PENDING');
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.document.update',
          entityType: 'DriverDocument',
          entityId: updated.id,
          metadata: { driverId }
        }
      });
      return updated;
    });
  }

  async reviewDriverDocument(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    status: DocumentStatus,
    reason?: string
  ) {
    const document = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverProfile: { userId: driverId } }
    });
    if (!document) throw new NotFoundException('وثيقة السائق غير موجودة.');
    this.assertReviewReason(status, reason);
    this.assertApprovableDocument(document, status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverDocument.update({
        where: { id: document.id },
        data: {
          status,
          reviewedById: actor.sub,
          reviewedAt: new Date(),
          rejectionReason: status === 'REJECTED' ? reason?.trim() || null : null
        },
        include: { region: true, mediaAsset: true }
      });
      await tx.mediaAsset.update({
        where: { id: document.mediaAssetId },
        data: {
          status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'PENDING',
          approvedById: actor.sub,
          approvedAt: status === 'APPROVED' ? new Date() : null,
          rejectedAt: status === 'REJECTED' ? new Date() : null,
          rejectionReason: status === 'REJECTED' ? reason?.trim() || null : null
        }
      });
      await this.syncDriverRegionAccess(tx, updated, status);
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: `driver.document.${status.toLowerCase()}`,
          entityType: 'DriverDocument',
          entityId: updated.id,
          metadata: { driverId, reason: reason?.trim() || null }
        }
      });
      return updated;
    });
  }

  async listVehicleDocuments(vehicleId: string) {
    const exists = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!exists) throw new NotFoundException('المركبة غير موجودة.');
    return this.prisma.vehicleDocument.findMany({
      where: { vehicleId },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
      include: {
        region: true,
        mediaAsset: true,
        reviewedBy: { select: { id: true, firstName: true, lastName: true } }
      }
    });
  }

  async createVehicleDocument(actor: AuthUser, vehicleId: string, dto: CreateDocumentDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!vehicle) throw new NotFoundException('المركبة غير موجودة.');
    const region = dto.regionCode ? await this.resolveRegion(dto.regionCode) : null;
    const dates = this.parseDates(dto.issuedAt, dto.expiresAt);

    return this.prisma.$transaction(async (tx) => {
      await this.media.assertAsset(
        dto.mediaAssetId,
        MediaPurpose.VEHICLE_DOCUMENT,
        MediaVisibility.PRIVATE,
        tx
      );
      const created = await tx.vehicleDocument.create({
        data: {
          vehicleId,
          mediaAssetId: dto.mediaAssetId,
          regionId: region?.id ?? null,
          documentType: this.normalizeDocumentType(dto.documentType),
          documentNumber: dto.documentNumber?.trim() || null,
          issuedAt: dates.issuedAt,
          expiresAt: dates.expiresAt,
          notes: dto.notes?.trim() || null
        },
        include: { region: true, mediaAsset: true }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'vehicle.document.create',
          entityType: 'VehicleDocument',
          entityId: created.id,
          metadata: {
            vehicleId,
            documentType: created.documentType,
            regionCode: region?.code ?? null,
            expiresAt: created.expiresAt?.toISOString() ?? null
          }
        }
      });
      return created;
    });
  }

  async updateVehicleDocument(actor: AuthUser, vehicleId: string, documentId: string, dto: UpdateDocumentDto) {
    const current = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId }
    });
    if (!current) throw new NotFoundException('وثيقة المركبة غير موجودة.');
    const region = dto.regionCode ? await this.resolveRegion(dto.regionCode) : undefined;
    const dates = this.parseDates(dto.issuedAt, dto.expiresAt, true);
    return this.prisma.$transaction(async (tx) => {
      await this.syncVehicleRegionAccess(tx, current, 'PENDING');
      const updated = await tx.vehicleDocument.update({
        where: { id: current.id },
        data: {
          ...(dto.documentType ? { documentType: this.normalizeDocumentType(dto.documentType) } : {}),
          ...(region ? { regionId: region.id } : {}),
          ...(dto.documentNumber !== undefined ? { documentNumber: dto.documentNumber.trim() || null } : {}),
          ...(dates.issuedAt !== undefined ? { issuedAt: dates.issuedAt } : {}),
          ...(dates.expiresAt !== undefined ? { expiresAt: dates.expiresAt } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          status: 'PENDING',
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null
        },
        include: { region: true, mediaAsset: true }
      });
      await tx.mediaAsset.update({
        where: { id: current.mediaAssetId },
        data: {
          status: 'PENDING',
          approvedById: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null
        }
      });
      await this.syncVehicleRegionAccess(tx, updated, 'PENDING');
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'vehicle.document.update',
          entityType: 'VehicleDocument',
          entityId: updated.id,
          metadata: { vehicleId }
        }
      });
      return updated;
    });
  }

  async reviewVehicleDocument(
    actor: AuthUser,
    vehicleId: string,
    documentId: string,
    status: DocumentStatus,
    reason?: string
  ) {
    const document = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId }
    });
    if (!document) throw new NotFoundException('وثيقة المركبة غير موجودة.');
    this.assertReviewReason(status, reason);
    this.assertApprovableDocument(document, status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicleDocument.update({
        where: { id: document.id },
        data: {
          status,
          reviewedById: actor.sub,
          reviewedAt: new Date(),
          rejectionReason: status === 'REJECTED' ? reason?.trim() || null : null
        },
        include: { region: true, mediaAsset: true }
      });
      await tx.mediaAsset.update({
        where: { id: document.mediaAssetId },
        data: {
          status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'PENDING',
          approvedById: actor.sub,
          approvedAt: status === 'APPROVED' ? new Date() : null,
          rejectedAt: status === 'REJECTED' ? new Date() : null,
          rejectionReason: status === 'REJECTED' ? reason?.trim() || null : null
        }
      });
      await this.syncVehicleRegionAccess(tx, updated, status);
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: `vehicle.document.${status.toLowerCase()}`,
          entityType: 'VehicleDocument',
          entityId: updated.id,
          metadata: { vehicleId, reason: reason?.trim() || null }
        }
      });
      return updated;
    });
  }

  async attachDriverAvatar(actor: AuthUser, driverId: string, mediaAssetId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: driverId }, select: { id: true } });
    if (!profile) throw new NotFoundException('السائق غير موجود.');
    const asset = await this.media.assertAsset(
      mediaAssetId,
      MediaPurpose.DRIVER_AVATAR,
      MediaVisibility.PUBLIC,
      this.prisma
    );
    const url = this.media.publicUrl(asset.id);
    const updated = await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        avatarMediaId: asset.id,
        avatarUrl: asset.status === 'APPROVED' ? url : null
      }
    });
    await this.audit(actor, 'driver.avatar.attach', 'DriverProfile', profile.id, { driverId, mediaAssetId });
    return { ...updated, avatarUrl: asset.status === 'APPROVED' ? url : null, pendingApproval: asset.status !== 'APPROVED' };
  }

  async attachVehicleImage(
    actor: AuthUser,
    driverId: string,
    vehicleId: string,
    dto: AttachVehicleImageDto
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverProfile: { userId: driverId } },
      select: { id: true }
    });
    if (!vehicle) throw new NotFoundException('المركبة غير موجودة لهذا السائق.');
    const asset = await this.media.assertAsset(
      dto.mediaAssetId,
      MediaPurpose.VEHICLE_IMAGE,
      MediaVisibility.PUBLIC,
      this.prisma
    );
    const url = this.media.publicUrl(asset.id);
    const image = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.vehicleImage.updateMany({ where: { vehicleId }, data: { isPrimary: false } });
      }
      const created = await tx.vehicleImage.create({
        data: {
          vehicleId,
          mediaAssetId: asset.id,
          url,
          isPrimary: dto.isPrimary ?? false,
          isApproved: asset.status === 'APPROVED',
          sortOrder: dto.sortOrder ?? 0
        }
      });
      if (dto.isPrimary) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: {
            primaryImageMediaId: asset.id,
            primaryImageUrl: asset.status === 'APPROVED' ? url : null
          }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'vehicle.media.attach',
          entityType: 'VehicleImage',
          entityId: created.id,
          metadata: { driverId, vehicleId, mediaAssetId: asset.id, isPrimary: created.isPrimary }
        }
      });
      return created;
    });
    return { ...image, publicUrl: asset.status === 'APPROVED' ? url : null, pendingApproval: asset.status !== 'APPROVED' };
  }

  async expiring(days = 30) {
    const numericDays = Number.isFinite(days) ? days : 30;
    const safeDays = Math.min(365, Math.max(0, numericDays));
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + safeDays);
    const [drivers, vehicles] = await Promise.all([
      this.prisma.driverDocument.findMany({
        where: { status: 'APPROVED', expiresAt: { gte: now, lte: until } },
        orderBy: { expiresAt: 'asc' },
        include: {
          region: true,
          driverProfile: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } } }
        }
      }),
      this.prisma.vehicleDocument.findMany({
        where: { status: 'APPROVED', expiresAt: { gte: now, lte: until } },
        orderBy: { expiresAt: 'asc' },
        include: {
          region: true,
          vehicle: { include: { driverProfile: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } } }
        }
      })
    ]);
    return { days: safeDays, driverDocuments: drivers, vehicleDocuments: vehicles };
  }

  async refreshExpiredDocuments() {
    const now = new Date();
    const [driverDocs, vehicleDocs] = await Promise.all([
      this.prisma.driverDocument.findMany({
        where: { status: 'APPROVED', expiresAt: { lt: now } },
        select: {
          id: true,
          driverProfileId: true,
          regionId: true,
          documentType: true,
          expiresAt: true
        }
      }),
      this.prisma.vehicleDocument.findMany({
        where: { status: 'APPROVED', expiresAt: { lt: now } },
        select: {
          id: true,
          vehicleId: true,
          regionId: true,
          documentType: true,
          documentNumber: true,
          expiresAt: true
        }
      })
    ]);
    if (driverDocs.length === 0 && vehicleDocs.length === 0) return { driver: 0, vehicle: 0 };

    await this.prisma.$transaction(async (tx) => {
      if (driverDocs.length) {
        await tx.driverDocument.updateMany({ where: { id: { in: driverDocs.map((doc) => doc.id) } }, data: { status: 'EXPIRED' } });
      }
      if (vehicleDocs.length) {
        await tx.vehicleDocument.updateMany({ where: { id: { in: vehicleDocs.map((doc) => doc.id) } }, data: { status: 'EXPIRED' } });
      }
      const driverPermits = driverDocs.filter((doc) => doc.documentType === 'REGION_ENTRY_PERMIT' && doc.regionId);
      for (const doc of driverPermits) {
        await this.syncDriverRegionAccess(tx, doc, 'EXPIRED');
      }
      const vehiclePermits = vehicleDocs.filter((doc) => doc.documentType === 'REGION_ENTRY_PERMIT' && doc.regionId);
      for (const doc of vehiclePermits) {
        await this.syncVehicleRegionAccess(
          tx,
          doc,
          'EXPIRED'
        );
      }
      await tx.auditLog.create({
        data: {
          action: 'compliance.documents.expire',
          entityType: 'ComplianceSweep',
          metadata: { driverDocumentIds: driverDocs.map((doc) => doc.id), vehicleDocumentIds: vehicleDocs.map((doc) => doc.id) }
        }
      });
    });
    return { driver: driverDocs.length, vehicle: vehicleDocs.length };
  }

  async requirementsForRegions(
    db: DbClient,
    regionIds: string[]
  ): Promise<RequirementLike[]> {
    if (regionIds.length === 0) return [];
    const client = db as Prisma.TransactionClient;
    return client.regionDocumentRequirement.findMany({
      where: { regionId: { in: regionIds }, isActive: true },
      include: { region: { select: { code: true, nameAr: true } } }
    });
  }

  evaluateDocuments(
    documents: DocumentLike[],
    requirements: RequirementLike[],
    subject: ComplianceSubject,
    at: Date
  ) {
    const relevant = requirements.filter((requirement) => requirement.subject === subject);
    const missing = relevant.filter((requirement) => {
      const validUntil = new Date(at);
      validUntil.setDate(validUntil.getDate() + requirement.minValidityDays);
      return !documents.some(
        (document) =>
          document.documentType === requirement.documentType &&
          document.status === 'APPROVED' &&
          (!requirement.regionScoped || document.regionId === requirement.regionId) &&
          (!document.expiresAt || document.expiresAt >= validUntil)
      );
    });
    return {
      eligible: missing.length === 0,
      missing: missing.map((requirement) => ({
        subject,
        documentType: requirement.documentType,
        regionId: requirement.regionId,
        regionCode: requirement.region?.code ?? null,
        regionNameAr: requirement.region?.nameAr ?? null,
        minValidityDays: requirement.minValidityDays,
        regionScoped: requirement.regionScoped
      }))
    };
  }

  async assertDriverVehicleCompliance(
    db: DbClient,
    driverProfileId: string,
    vehicleId: string,
    requiredRegionIds: string[],
    at: Date
  ) {
    const requirements = await this.requirementsForRegions(db, requiredRegionIds);
    if (requirements.length === 0) return;
    const client = db as Prisma.TransactionClient;
    const [driverDocuments, vehicleDocuments] = await Promise.all([
      client.driverDocument.findMany({
        where: { driverProfileId },
        select: { documentType: true, regionId: true, status: true, expiresAt: true }
      }),
      client.vehicleDocument.findMany({
        where: { vehicleId },
        select: { documentType: true, regionId: true, status: true, expiresAt: true }
      })
    ]);
    const driver = this.evaluateDocuments(driverDocuments, requirements, 'DRIVER', at);
    const vehicle = this.evaluateDocuments(vehicleDocuments, requirements, 'VEHICLE', at);
    if (!driver.eligible || !vehicle.eligible) {
      const missing = [...driver.missing, ...vehicle.missing]
        .map((item) => `${item.subject === 'DRIVER' ? 'السائق' : 'المركبة'}: ${item.documentType}${item.regionNameAr ? ` (${item.regionNameAr})` : ''}`)
        .join('، ');
      throw new ConflictException(`وثائق الأهلية غير مكتملة أو منتهية: ${missing}`);
    }
  }

  private async syncDriverRegionAccess(
    tx: Prisma.TransactionClient,
    document: { id?: string; driverProfileId: string; regionId: string | null; documentType: string; expiresAt: Date | null },
    status: DocumentStatus
  ) {
    if (document.documentType !== 'REGION_ENTRY_PERMIT' || !document.regionId) return;
    if (status !== 'APPROVED') {
      const alternative = await tx.driverDocument.findFirst({
        where: {
          id: document.id ? { not: document.id } : undefined,
          driverProfileId: document.driverProfileId,
          regionId: document.regionId,
          documentType: 'REGION_ENTRY_PERMIT',
          status: 'APPROVED',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }]
        },
        select: { id: true }
      });
      if (alternative) return;
    }
    await tx.driverRegionAccess.upsert({
      where: { driverProfileId_regionId: { driverProfileId: document.driverProfileId, regionId: document.regionId } },
      update: {
        status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : status === 'EXPIRED' ? 'EXPIRED' : 'SUSPENDED',
        validUntil: document.expiresAt
      },
      create: {
        driverProfileId: document.driverProfileId,
        regionId: document.regionId,
        status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : status === 'EXPIRED' ? 'EXPIRED' : 'SUSPENDED',
        validUntil: document.expiresAt
      }
    });
  }

  private async syncVehicleRegionAccess(
    tx: Prisma.TransactionClient,
    document: { id?: string; vehicleId: string; regionId: string | null; documentType: string; documentNumber: string | null; expiresAt: Date | null },
    status: DocumentStatus
  ) {
    if (document.documentType !== 'REGION_ENTRY_PERMIT' || !document.regionId) return;
    if (status !== 'APPROVED') {
      const alternative = await tx.vehicleDocument.findFirst({
        where: {
          id: document.id ? { not: document.id } : undefined,
          vehicleId: document.vehicleId,
          regionId: document.regionId,
          documentType: 'REGION_ENTRY_PERMIT',
          status: 'APPROVED',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }]
        },
        select: { id: true }
      });
      if (alternative) return;
    }
    await tx.vehicleRegionAccess.upsert({
      where: { vehicleId_regionId: { vehicleId: document.vehicleId, regionId: document.regionId } },
      update: {
        status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : status === 'EXPIRED' ? 'EXPIRED' : 'SUSPENDED',
        permitNumber: document.documentNumber,
        validUntil: document.expiresAt
      },
      create: {
        vehicleId: document.vehicleId,
        regionId: document.regionId,
        status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : status === 'EXPIRED' ? 'EXPIRED' : 'SUSPENDED',
        permitNumber: document.documentNumber,
        validUntil: document.expiresAt
      }
    });
  }

  private async resolveRegion(code: string) {
    const normalized = code.trim().toUpperCase();
    const region = await this.prisma.serviceRegion.findFirst({
      where: { code: normalized, kind: 'COUNTRY_ACCESS', isActive: true }
    });
    if (!region) throw new NotFoundException(`منطقة الدخول غير موجودة: ${normalized}`);
    return region;
  }

  private normalizeDocumentType(value: string) {
    const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
    if (!normalized) throw new BadRequestException('نوع الوثيقة غير صالح.');
    return normalized;
  }

  private parseDates(issuedAt?: string, expiresAt?: string, partial = false) {
    const issued = issuedAt === undefined ? (partial ? undefined : null) : new Date(issuedAt);
    const expires = expiresAt === undefined ? (partial ? undefined : null) : new Date(expiresAt);
    if (issued instanceof Date && Number.isNaN(issued.getTime())) throw new BadRequestException('تاريخ إصدار الوثيقة غير صالح.');
    if (expires instanceof Date && Number.isNaN(expires.getTime())) throw new BadRequestException('تاريخ انتهاء الوثيقة غير صالح.');
    if (issued instanceof Date && expires instanceof Date && expires < issued) {
      throw new BadRequestException('تاريخ انتهاء الوثيقة يسبق تاريخ الإصدار.');
    }
    return { issuedAt: issued, expiresAt: expires };
  }

  private assertApprovableDocument(
    document: { documentType: string; regionId: string | null; expiresAt: Date | null },
    status: DocumentStatus
  ) {
    if (status !== 'APPROVED') return;
    if (document.expiresAt && document.expiresAt < new Date()) {
      throw new ConflictException('لا يمكن اعتماد وثيقة منتهية الصلاحية.');
    }
    if (document.documentType === 'REGION_ENTRY_PERMIT' && document.regionId && !document.expiresAt) {
      throw new BadRequestException('يجب تحديد تاريخ انتهاء تصريح الدخول الإقليمي.');
    }
  }

  private assertReviewReason(status: DocumentStatus, reason?: string) {
    if (status === 'REJECTED' && (!reason || reason.trim().length < 3)) {
      throw new BadRequestException('يجب كتابة سبب رفض الوثيقة.');
    }
  }

  private audit(
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue
  ) {
    return this.prisma.auditLog.create({
      data: { actorId: actor.sub, action, entityType, entityId, metadata }
    });
  }
}
