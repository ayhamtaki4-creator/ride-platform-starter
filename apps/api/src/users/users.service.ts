import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        roles: {
          select: {
            role: { select: { code: true, name: true } }
          }
        },
        passengerTrips: {
          where: { bookingReference: { not: null } },
          select: {
            id: true,
            status: true,
            bookingReviewStatus: true,
            estimatedFare: true,
            finalFare: true,
            currency: true,
            requestedAt: true
          },
          orderBy: { requestedAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    });

    return users.map((user) => this.serializeUser(user));
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        roles: { include: { role: true } },
        passengerProfile: true,
        driverProfile: {
          include: {
            baseRegion: true,
            regionAccesses: { include: { region: true } },
            vehicles: {
              include: {
                regionAccesses: { include: { region: true } },
                images: true
              }
            }
          }
        },
        passengerTrips: {
          where: { bookingReference: { not: null } },
          orderBy: { requestedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            bookingReference: true,
            status: true,
            bookingReviewStatus: true,
            travelDate: true,
            estimatedFare: true,
            finalFare: true,
            currency: true
          }
        }
      }
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود.');
    return user;
  }

  async create(actor: AuthUser, dto: CreateAdminUserDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;
    await this.assertUniqueIdentity(email, phone);

    const roleCodes = this.normalizeRoles(dto.roleCodes);
    this.assertRoleAssignmentAllowed(actor, roleCodes);
    if (roleCodes.includes('DRIVER')) {
      throw new BadRequestException(
        'أنشئ السائق من مسار /api/admin/drivers حتى يتم إنشاء ملف السائق والمركبة والصلاحيات معًا.'
      );
    }

    const roles = await this.resolveRoles(roleCodes);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          roles: {
            create: roles.map((role) => ({ roleId: role.id }))
          },
          ...(roleCodes.includes('PASSENGER')
            ? { passengerProfile: { create: {} } }
            : {})
        },
        include: { roles: { include: { role: true } } }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'user.create',
          entityType: 'User',
          entityId: created.id,
          metadata: { email, phone, roleCodes }
        }
      });
      return created;
    });

    return this.safeUser(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateAdminUserDto) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        driverProfile: { select: { id: true } }
      }
    });
    if (!current) throw new NotFoundException('المستخدم غير موجود.');
    this.assertCanManageTarget(
      actor,
      current.roles.map((entry) => entry.role.code)
    );

    const roleCodes = dto.roleCodes ? this.normalizeRoles(dto.roleCodes) : null;
    if (roleCodes) {
      this.assertRoleAssignmentAllowed(actor, roleCodes);
      if (roleCodes.includes('DRIVER') && !current.driverProfile) {
        throw new BadRequestException(
          'لا يمكن تحويل المستخدم إلى سائق من هذا المسار. استخدم إنشاء السائق الإداري.'
        );
      }
      if (current.driverProfile && !roleCodes.includes('DRIVER')) {
        throw new BadRequestException(
          'لا يمكن إزالة دور DRIVER مع بقاء ملف السائق. استخدم تعليق السائق أو حسابه.'
        );
      }
    }

    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone !== undefined ? dto.phone.trim() || null : undefined;
    if (email || phone !== undefined) {
      await this.assertUniqueIdentity(email ?? current.email, phone ?? current.phone, id);
    }

    const roles = roleCodes ? await this.resolveRoles(roleCodes) : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
          ...(email ? { email } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(roles
            ? { roles: { create: roles.map((role) => ({ roleId: role.id })) } }
            : {})
        },
        include: { roles: { include: { role: true } } }
      });

      if (roleCodes?.includes('PASSENGER')) {
        await tx.passengerProfile.upsert({
          where: { userId: id },
          update: {},
          create: { userId: id }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'user.update',
          entityType: 'User',
          entityId: id,
          metadata: {
            roleCodes,
            email: email ?? null,
            phone: phone ?? null
          }
        }
      });
      return user;
    });

    return this.safeUser(updated);
  }

  async setStatus(actor: AuthUser, id: string, status: Extract<UserStatus, 'ACTIVE' | 'SUSPENDED'>) {
    if (actor.sub === id && status === 'SUSPENDED') {
      throw new BadRequestException('لا يمكنك تعليق حسابك الإداري بنفسك.');
    }

    const current = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } }
    });
    if (!current) throw new NotFoundException('المستخدم غير موجود.');
    this.assertCanManageTarget(
      actor,
      current.roles.map((entry) => entry.role.code)
    );

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { status } });
      if (status === 'SUSPENDED') {
        await tx.driverProfile.updateMany({
          where: { userId: id },
          data: { availability: 'OFFLINE' }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'user.status.update',
          entityType: 'User',
          entityId: id,
          metadata: { from: current.status, to: status }
        }
      });
      return updated;
    });

    return this.safeUser(user);
  }

  async resetPassword(actor: AuthUser, id: string, password: string) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } }
    });
    if (!current) throw new NotFoundException('المستخدم غير موجود.');
    this.assertCanManageTarget(
      actor,
      current.roles.map((entry) => entry.role.code)
    );

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'user.password.reset',
          entityType: 'User',
          entityId: id
        }
      })
    ]);
    return { success: true, userId: id };
  }

  private serializeUser(user: {
    id: string;
    email: string;
    phone: string | null;
    firstName: string;
    lastName: string;
    status: UserStatus;
    createdAt: Date;
    roles: Array<{ role: { code: string; name: string } }>;
    passengerTrips: Array<{
      status: string;
      estimatedFare: unknown;
      finalFare: unknown;
      currency: string;
      requestedAt: Date;
    }>;
  }) {
    const completed = user.passengerTrips.filter((trip) => trip.status === 'COMPLETED');
    const totalSpent = completed.reduce(
      (sum, trip) => sum + Number(trip.finalFare ?? trip.estimatedFare ?? 0),
      0
    );

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      createdAt: user.createdAt,
      roles: user.roles,
      bookingCount: user.passengerTrips.length,
      completedBookings: completed.length,
      totalSpent,
      currency: completed[0]?.currency ?? 'USD',
      latestBookingAt: user.passengerTrips[0]?.requestedAt ?? null
    };
  }

  private async assertUniqueIdentity(email: string, phone: string | null, excludedId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        id: excludedId ? { not: excludedId } : undefined,
        OR: [{ email }, ...(phone ? [{ phone }] : [])]
      },
      select: { id: true }
    });
    if (existing) {
      throw new ConflictException('البريد الإلكتروني أو رقم الهاتف مستخدم مسبقًا.');
    }
  }

  private normalizeRoles(roleCodes: string[]) {
    return Array.from(new Set(roleCodes.map((code) => code.trim().toUpperCase())));
  }

  private assertRoleAssignmentAllowed(actor: AuthUser, roleCodes: string[]) {
    const protectedRoles = roleCodes.filter((code) =>
      ['ADMIN', 'SUPER_ADMIN'].includes(code)
    );
    if (protectedRoles.length > 0 && !actor.roles.includes('SUPER_ADMIN')) {
      throw new BadRequestException(
        'فقط المدير الأعلى يستطيع منح أدوار ADMIN أو SUPER_ADMIN.'
      );
    }
  }

  private assertCanManageTarget(actor: AuthUser, targetRoleCodes: string[]) {
    if (
      !actor.roles.includes('SUPER_ADMIN') &&
      targetRoleCodes.some((code) => ['ADMIN', 'SUPER_ADMIN'].includes(code))
    ) {
      throw new BadRequestException(
        'لا يمكن تعديل حساب إداري محمي إلا بواسطة SUPER_ADMIN.'
      );
    }
  }

  private async resolveRoles(roleCodes: string[]) {
    const roles = await this.prisma.role.findMany({ where: { code: { in: roleCodes } } });
    if (roles.length !== roleCodes.length) {
      const found = new Set(roles.map((role) => role.code));
      const missing = roleCodes.filter((code) => !found.has(code));
      throw new NotFoundException(`الأدوار غير موجودة: ${missing.join(', ')}`);
    }
    return roles;
  }

  private safeUser<T extends object>(user: T): Omit<T, 'passwordHash'> {
    const safe = { ...user } as T & { passwordHash?: unknown };
    delete safe.passwordHash;
    return safe;
  }
}
