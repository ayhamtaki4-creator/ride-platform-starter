import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AccessStatus, DriverStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { normalizeInternationalPhone } from '../common/phone';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AddVehicleImageDto } from './dto/add-vehicle-image.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateAccessRegionsDto } from './dto/update-access-regions.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';

const driverInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      driverTrips: {
        select: {
          id: true,
          status: true,
          travelDate: true,
          driverAssignmentStatus: true
        }
      },
      driverServiceRuns: {
        where: {
          travelDate: { gte: new Date() },
          status: {
            in: [
              'DRAFT',
              'PLANNED',
              'SCHEDULED',
              'DRIVER_PENDING',
              'DRIVER_ACCEPTED',
              'BOARDING',
              'IN_PROGRESS',
              'DRIVER_REPLACEMENT_REQUIRED'
            ]
          }
        },
        orderBy: { travelDate: 'asc' as const },
        take: 20,
        select: {
          id: true,
          runReference: true,
          direction: true,
          routeId: true,
          route: { select: { id: true, code: true, nameAr: true } },
          bookingType: true,
          travelDate: true,
          status: true,
          reservedSeats: true,
          seatCapacity: true
        }
      }
    }
  },
  baseRegion: true,
  avatarMedia: true,
  regionAccesses: {
    include: { region: true },
    orderBy: { region: { code: 'asc' as const } }
  },
  documents: {
    orderBy: [{ documentType: 'asc' as const }, { createdAt: 'desc' as const }],
    include: { region: true, mediaAsset: true }
  },
  vehicles: {
    orderBy: [{ isActive: 'desc' as const }, { year: 'desc' as const }],
    include: {
      baseRegion: true,
      primaryImageMedia: true,
      documents: {
        orderBy: [{ documentType: 'asc' as const }, { createdAt: 'desc' as const }],
        include: { region: true, mediaAsset: true }
      },
      regionAccesses: {
        include: { region: true },
        orderBy: { region: { code: 'asc' as const } }
      },
      images: {
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        include: { mediaAsset: true }
      }
    }
  }
} satisfies Prisma.DriverProfileInclude;

type DriverWithRelations = Prisma.DriverProfileGetPayload<{ include: typeof driverInclude }>;

@Injectable()
export class AdminDriverManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const profiles = await this.prisma.driverProfile.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: driverInclude
    });
    return profiles.map((profile) => this.serialize(profile));
  }

  async detail(driverId: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      include: driverInclude
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');
    return this.serialize(profile);
  }

  async create(actor: AuthUser, dto: CreateDriverDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim()
      ? normalizeInternationalPhone(dto.phone)
      : null;
    const plateNumber = dto.plateNumber.trim().toUpperCase();
    const licenseNumber = dto.licenseNumber?.trim().toUpperCase() || null;

    const [existingUser, existingVehicle, existingLicense] = await Promise.all([
      this.prisma.user.findFirst({
        where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
        select: { id: true }
      }),
      this.prisma.vehicle.findUnique({
        where: { plateNumber },
        select: { id: true }
      }),
      licenseNumber
        ? this.prisma.driverProfile.findUnique({
            where: { licenseNumber },
            select: { id: true }
          })
        : Promise.resolve(null)
    ]);

    if (existingUser) {
      throw new ConflictException('يوجد مستخدم بنفس البريد الإلكتروني أو رقم الهاتف.');
    }
    if (existingVehicle) throw new ConflictException('رقم اللوحة مستخدم لمركبة أخرى.');
    if (existingLicense) throw new ConflictException('رقم رخصة القيادة مستخدم لسائق آخر.');

    const [baseRegion, vehicleBaseRegion, driverRegions, vehicleRegions] = await Promise.all([
      this.resolveBaseRegion(dto.baseRegionCode ?? 'DAMASCUS'),
      this.resolveBaseRegion(dto.vehicleBaseRegionCode ?? dto.baseRegionCode ?? 'DAMASCUS'),
      this.resolveRegions(dto.driverRegionCodes ?? ['SYRIA']),
      this.resolveRegions(dto.vehicleRegionCodes ?? dto.driverRegionCodes ?? ['SYRIA'])
    ]);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const imageUrls = this.normalizeUrls([
      dto.primaryImageUrl,
      ...(dto.vehicleImageUrls ?? [])
    ]);

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { code: 'DRIVER' } });
      if (!role) throw new NotFoundException('دور السائق غير موجود.');

      const user = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          whatsappOptIn: Boolean(phone),
          roles: { create: { roleId: role.id } },
          driverProfile: {
            create: {
              status: 'PENDING_REVIEW',
              availability: 'OFFLINE',
              licenseNumber,
              avatarUrl: dto.avatarUrl?.trim() || null,
              baseRegionId: baseRegion.id,
              regionAccesses: {
                create: driverRegions.map((region) => ({
                  regionId: region.id,
                  status: 'APPROVED'
                }))
              },
              vehicles: {
                create: {
                  make: dto.make.trim(),
                  model: dto.model.trim(),
                  year: dto.year,
                  color: dto.color.trim(),
                  plateNumber,
                  seatCapacity: dto.seatCapacity,
                  primaryImageUrl: dto.primaryImageUrl?.trim() || imageUrls[0] || null,
                  baseRegionId: vehicleBaseRegion.id,
                  isActive: true,
                  regionAccesses: {
                    create: vehicleRegions.map((region) => ({
                      regionId: region.id,
                      status: 'APPROVED'
                    }))
                  },
                  ...(imageUrls.length
                    ? {
                        images: {
                          create: imageUrls.map((url, index) => ({
                            url,
                            isPrimary: index === 0,
                            isApproved: true,
                            sortOrder: index
                          }))
                        }
                      }
                    : {})
                }
              }
            }
          }
        },
        include: { driverProfile: { include: { vehicles: true } } }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.create',
          entityType: 'User',
          entityId: user.id,
          metadata: {
            email,
            phone,
            plateNumber,
            seatCapacity: dto.seatCapacity,
            baseRegionCode: baseRegion.code,
            vehicleBaseRegionCode: vehicleBaseRegion.code,
            driverRegionCodes: driverRegions.map((region) => region.code),
            vehicleRegionCodes: vehicleRegions.map((region) => region.code),
            approvalStatus: 'PENDING_REVIEW'
          }
        }
      });
      return user;
    });

    return created;
  }

  async updateStatus(actor: AuthUser, driverId: string, status: DriverStatus) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.driverProfile.update({
        where: { userId: driverId },
        data: {
          status,
          ...(status === 'APPROVED' ? {} : { availability: 'OFFLINE' })
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.status.update',
          entityType: 'DriverProfile',
          entityId: result.id,
          metadata: { driverId, from: profile.status, to: status }
        }
      });
      return result;
    });
    return updated;
  }

  async updateProfile(actor: AuthUser, driverId: string, dto: UpdateDriverProfileDto) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');

    const baseRegion = dto.baseRegionCode
      ? await this.resolveBaseRegion(dto.baseRegionCode)
      : null;
    const licenseNumber = dto.licenseNumber?.trim().toUpperCase();
    if (licenseNumber) {
      const duplicate = await this.prisma.driverProfile.findFirst({
        where: { licenseNumber, id: { not: profile.id } },
        select: { id: true }
      });
      if (duplicate) throw new ConflictException('رقم رخصة القيادة مستخدم مسبقًا.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.driverProfile.update({
        where: { id: profile.id },
        data: {
          ...(dto.licenseNumber !== undefined
            ? { licenseNumber: licenseNumber || null }
            : {}),
          ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl.trim() || null } : {}),
          ...(baseRegion ? { baseRegionId: baseRegion.id } : {})
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.profile.update',
          entityType: 'DriverProfile',
          entityId: profile.id,
          metadata: {
            driverId,
            baseRegionCode: baseRegion?.code ?? null,
            avatarUpdated: dto.avatarUrl !== undefined
          }
        }
      });
      return result;
    });
    return updated;
  }

  async updateDriverRegions(
    actor: AuthUser,
    driverId: string,
    dto: UpdateAccessRegionsDto
  ) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      select: { id: true }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');

    const regions = await this.resolveRegions(dto.regionCodes);
    await this.replaceDriverAccesses(actor, profile.id, driverId, regions, dto);
    return this.detail(driverId);
  }

  async addVehicle(actor: AuthUser, driverId: string, dto: CreateVehicleDto) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      select: { id: true }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');

    const plateNumber = dto.plateNumber.trim().toUpperCase();
    const duplicate = await this.prisma.vehicle.findUnique({
      where: { plateNumber },
      select: { id: true }
    });
    if (duplicate) throw new ConflictException('رقم اللوحة مستخدم لمركبة أخرى.');

    const [baseRegion, regions] = await Promise.all([
      this.resolveBaseRegion(dto.baseRegionCode),
      this.resolveRegions(dto.regionCodes)
    ]);
    const imageUrls = this.normalizeUrls([dto.primaryImageUrl, ...(dto.imageUrls ?? [])]);

    const vehicle = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicle.create({
        data: {
          driverProfileId: profile.id,
          make: dto.make.trim(),
          model: dto.model.trim(),
          year: dto.year,
          color: dto.color.trim(),
          plateNumber,
          seatCapacity: dto.seatCapacity,
          primaryImageUrl: dto.primaryImageUrl?.trim() || imageUrls[0] || null,
          baseRegionId: baseRegion.id,
          isActive: true,
          regionAccesses: {
            create: regions.map((region) => ({
              regionId: region.id,
              status: 'APPROVED'
            }))
          },
          ...(imageUrls.length
            ? {
                images: {
                  create: imageUrls.map((url, index) => ({
                    url,
                    isPrimary: index === 0,
                    isApproved: true,
                    sortOrder: index
                  }))
                }
              }
            : {})
        },
        include: {
          baseRegion: true,
          regionAccesses: { include: { region: true } },
          images: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.vehicle.create',
          entityType: 'Vehicle',
          entityId: result.id,
          metadata: {
            driverId,
            plateNumber,
            baseRegionCode: baseRegion.code,
            regionCodes: regions.map((region) => region.code)
          }
        }
      });
      return result;
    });
    return vehicle;
  }

  async updateVehicle(actor: AuthUser, driverId: string, dto: UpdateDriverVehicleDto) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      include: {
        vehicles: {
          where: { isActive: true },
          orderBy: { year: 'desc' },
          take: 1
        }
      }
    });
    if (!profile) throw new NotFoundException('السائق غير موجود.');

    const current = profile.vehicles[0];
    if (!current) {
      throw new NotFoundException('لا توجد مركبة فعالة. استخدم مسار إضافة مركبة.');
    }
    return this.updateVehicleById(actor, driverId, current.id, dto);
  }

  async updateVehicleById(
    actor: AuthUser,
    driverId: string,
    vehicleId: string,
    dto: UpdateDriverVehicleDto
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverProfile: { userId: driverId } }
    });
    if (!vehicle) throw new NotFoundException('المركبة غير موجودة لهذا السائق.');

    const plateNumber = dto.plateNumber.trim().toUpperCase();
    const baseRegion = dto.baseRegionCode
      ? await this.resolveBaseRegion(dto.baseRegionCode)
      : null;
    const duplicate = await this.prisma.vehicle.findFirst({
      where: { plateNumber, id: { not: vehicle.id } },
      select: { id: true }
    });
    if (duplicate) throw new ConflictException('رقم اللوحة مستخدم لمركبة أخرى.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          make: dto.make.trim(),
          model: dto.model.trim(),
          year: dto.year,
          color: dto.color.trim(),
          plateNumber,
          seatCapacity: dto.seatCapacity,
          ...(dto.primaryImageUrl !== undefined
            ? { primaryImageUrl: dto.primaryImageUrl.trim() || null }
            : {}),
          ...(baseRegion ? { baseRegionId: baseRegion.id } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.vehicle.update',
          entityType: 'Vehicle',
          entityId: result.id,
          metadata: {
            driverId,
            plateNumber,
            seatCapacity: result.seatCapacity,
            baseRegionCode: baseRegion?.code ?? null
          }
        }
      });
      return result;
    });
    return updated;
  }

  async updateVehicleRegions(
    actor: AuthUser,
    driverId: string,
    vehicleId: string,
    dto: UpdateAccessRegionsDto
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverProfile: { userId: driverId } },
      select: { id: true }
    });
    if (!vehicle) throw new NotFoundException('المركبة غير موجودة لهذا السائق.');

    const regions = await this.resolveRegions(dto.regionCodes);
    await this.replaceVehicleAccesses(actor, vehicle.id, driverId, regions, dto);
    return this.detail(driverId);
  }

  async addVehicleImage(
    actor: AuthUser,
    driverId: string,
    vehicleId: string,
    dto: AddVehicleImageDto
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverProfile: { userId: driverId } },
      select: { id: true }
    });
    if (!vehicle) throw new NotFoundException('المركبة غير موجودة لهذا السائق.');

    const image = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.vehicleImage.updateMany({
          where: { vehicleId },
          data: { isPrimary: false }
        });
      }
      const created = await tx.vehicleImage.create({
        data: {
          vehicleId,
          url: dto.url.trim(),
          isPrimary: dto.isPrimary ?? false,
          isApproved: dto.isApproved ?? true,
          sortOrder: dto.sortOrder ?? 0
        }
      });
      if (dto.isPrimary && created.isApproved) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { primaryImageUrl: created.url }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.vehicle.image.add',
          entityType: 'VehicleImage',
          entityId: created.id,
          metadata: { driverId, vehicleId, isPrimary: created.isPrimary }
        }
      });
      return created;
    });
    return image;
  }

  private async replaceDriverAccesses(
    actor: AuthUser,
    driverProfileId: string,
    driverId: string,
    regions: Array<{ id: string; code: string }>,
    dto: UpdateAccessRegionsDto
  ) {
    const status = dto.status ?? AccessStatus.APPROVED;
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    this.assertDateRange(validFrom, validUntil);

    await this.prisma.$transaction(async (tx) => {
      await tx.driverRegionAccess.updateMany({
        where: {
          driverProfileId,
          regionId: { notIn: regions.map((region) => region.id) }
        },
        data: { status: 'SUSPENDED' }
      });
      for (const region of regions) {
        await tx.driverRegionAccess.upsert({
          where: {
            driverProfileId_regionId: { driverProfileId, regionId: region.id }
          },
          update: {
            status,
            validFrom,
            validUntil,
            notes: dto.notes?.trim() || null
          },
          create: {
            driverProfileId,
            regionId: region.id,
            status,
            validFrom,
            validUntil,
            notes: dto.notes?.trim() || null
          }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.regions.update',
          entityType: 'DriverProfile',
          entityId: driverProfileId,
          metadata: { driverId, regionCodes: regions.map((region) => region.code), status }
        }
      });
    });
  }

  private async replaceVehicleAccesses(
    actor: AuthUser,
    vehicleId: string,
    driverId: string,
    regions: Array<{ id: string; code: string }>,
    dto: UpdateAccessRegionsDto
  ) {
    const status = dto.status ?? AccessStatus.APPROVED;
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    this.assertDateRange(validFrom, validUntil);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleRegionAccess.updateMany({
        where: { vehicleId, regionId: { notIn: regions.map((region) => region.id) } },
        data: { status: 'SUSPENDED' }
      });
      for (const region of regions) {
        await tx.vehicleRegionAccess.upsert({
          where: { vehicleId_regionId: { vehicleId, regionId: region.id } },
          update: {
            status,
            validFrom,
            validUntil,
            notes: dto.notes?.trim() || null
          },
          create: {
            vehicleId,
            regionId: region.id,
            status,
            validFrom,
            validUntil,
            notes: dto.notes?.trim() || null
          }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'vehicle.regions.update',
          entityType: 'Vehicle',
          entityId: vehicleId,
          metadata: { driverId, regionCodes: regions.map((region) => region.code), status }
        }
      });
    });
  }

  private async resolveBaseRegion(code: string) {
    const normalized = this.normalizeCode(code);
    const region = await this.prisma.serviceRegion.findFirst({
      where: { code: normalized, kind: 'OPERATING_HUB', isActive: true }
    });
    if (!region) throw new NotFoundException(`مركز التشغيل غير موجود: ${normalized}`);
    return region;
  }

  private async resolveRegions(codes: string[]) {
    const normalized = Array.from(new Set(codes.map((code) => this.normalizeCode(code))));
    if (normalized.length === 0) {
      throw new BadRequestException('يجب تحديد منطقة تشغيل واحدة على الأقل.');
    }
    const regions = await this.prisma.serviceRegion.findMany({
      where: { code: { in: normalized }, kind: 'COUNTRY_ACCESS', isActive: true },
      select: { id: true, code: true }
    });
    if (regions.length !== normalized.length) {
      const found = new Set(regions.map((region) => region.code));
      const missing = normalized.filter((code) => !found.has(code));
      throw new NotFoundException(`مناطق التشغيل غير موجودة: ${missing.join(', ')}`);
    }
    return regions;
  }

  private serialize(profile: DriverWithRelations) {
    return {
      id: profile.id,
      userId: profile.userId,
      status: profile.status,
      availability: profile.availability,
      rating: profile.rating,
      licenseNumber: profile.licenseNumber,
      avatarUrl: profile.avatarUrl,
      avatarMedia: profile.avatarMedia,
      baseRegion: profile.baseRegion,
      regionAccesses: profile.regionAccesses,
      documents: profile.documents,
      createdAt: profile.createdAt,
      user: {
        id: profile.user.id,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        email: profile.user.email,
        phone: profile.user.phone,
        status: profile.user.status,
        createdAt: profile.user.createdAt
      },
      vehicles: profile.vehicles.map((vehicle) => ({
        ...vehicle,
        publicImageUrl:
          vehicle.primaryImageUrl ??
          vehicle.images.find((image) => image.isPrimary && image.isApproved)?.url ??
          vehicle.images.find((image) => image.isApproved)?.url ??
          null
      })),
      completedTrips: profile.user.driverTrips.filter((trip) => trip.status === 'COMPLETED').length,
      assignedBookings: profile.user.driverTrips.filter(
        (trip) =>
          trip.driverAssignmentStatus === 'PENDING' ||
          trip.driverAssignmentStatus === 'ACCEPTED'
      ).length,
      upcomingRuns: profile.user.driverServiceRuns
    };
  }

  private assertDateRange(validFrom: Date | null, validUntil: Date | null) {
    if (validFrom && Number.isNaN(validFrom.getTime())) {
      throw new BadRequestException('تاريخ بداية الصلاحية غير صحيح.');
    }
    if (validUntil && Number.isNaN(validUntil.getTime())) {
      throw new BadRequestException('تاريخ انتهاء الصلاحية غير صحيح.');
    }
    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException('تاريخ انتهاء الصلاحية يسبق تاريخ البداية.');
    }
  }

  private normalizeCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
  }

  private normalizeUrls(values: Array<string | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())));
  }
}
