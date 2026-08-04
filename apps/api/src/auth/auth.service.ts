import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { normalizeInternationalPhone } from '../common/phone';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

type SessionContext = {
  userAgent?: string;
  ipAddress?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async registerPassenger(dto: RegisterDto, context?: SessionContext) {
    const email = dto.email.trim().toLowerCase();
    const phone = normalizeInternationalPhone(dto.phone);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] }
    });

    if (existing) {
      throw new ConflictException('البريد الإلكتروني أو رقم الهاتف مستخدم مسبقًا.');
    }

    const passengerRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: 'PASSENGER' }
    });

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passengerProfile: { create: {} },
        roles: { create: { roleId: passengerRole.id } }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.register',
        entityType: 'User',
        entityId: user.id
      }
    });

    return this.createSession(user.id, context);
  }

  async login(dto: LoginDto, context?: SessionContext) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('الحساب غير نشط.');
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id
      }
    });

    return this.createSession(user.id, context);
  }

  current(user: AuthUser) {
    return this.loadUserView(user.sub);
  }

  async refresh(refreshToken: string, context?: SessionContext) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true } // 👈 يحل مشكلة TS2339 الخاصة بـ session.user
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('جلسة الدخول منتهية. سجل الدخول من جديد.');
    }

    const rotatedToken = this.generateRefreshToken();
    const rotatedHash = this.hashRefreshToken(rotatedToken);

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        tokenHash: rotatedHash,
        lastUsedAt: new Date(),
        userAgent: context?.userAgent?.slice(0, 500) ?? session.userAgent,
        ipAddress: context?.ipAddress?.slice(0, 100) ?? session.ipAddress
      }
    });

    return this.issueAccessToken(session.userId, session.id, rotatedToken);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return { success: true };
  }

  async updatePreferences(user: AuthUser, dto: UpdatePreferencesDto) {
    const phone = dto.phone
      ? normalizeInternationalPhone(dto.phone)
      : undefined;

    if (dto.whatsappOptIn && !phone) {
      const current = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { phone: true }
      });
      if (!current?.phone) {
        throw new BadRequestException(
          'أضف رقم هاتف دوليًا قبل تفعيل تحديثات WhatsApp.'
        );
      }
    }

    if (phone) {
      const existing = await this.prisma.user.findFirst({
        where: { phone, id: { not: user.sub } },
        select: { id: true }
      });
      if (existing) throw new ConflictException('رقم الهاتف مستخدم في حساب آخر.');
    }

    await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        ...(phone ? { phone } : {})
      }
    });

    return this.loadUserView(user.sub);
  }

  private async createSession(userId: string, context?: SessionContext) {
    const refreshToken = this.generateRefreshToken();
    const refreshDays = Math.max(
      1,
      Number(this.config.get<string>('REFRESH_TOKEN_EXPIRES_DAYS') ?? '30') || 30
    );
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
        userAgent: context?.userAgent?.slice(0, 500),
        ipAddress: context?.ipAddress?.slice(0, 100)
      }
    });

    return this.issueAccessToken(userId, session.id, refreshToken);
  }

  private async issueAccessToken(
    userId: string,
    sessionId: string,
    refreshToken: string
  ) {
    const user = await this.loadUserWithPermissions(userId);
    const roles: string[] = user.roles.map((item) => item.role.code);
    const permissions: string[] = Array.from(
      new Set<string>(
        user.roles.flatMap((item) =>
          item.role.permissions.map((entry) => entry.permission.code)
        )
      )
    );

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      sid: sessionId,
      email: user.email,
      roles,
      permissions
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        permissions
      }
    };
  }

  private async loadUserView(userId: string) {
    const user = await this.loadUserWithPermissions(userId);
    const roles: string[] = user.roles.map((item) => item.role.code);
    const permissions: string[] = Array.from(
      new Set<string>(
        user.roles.flatMap((item) =>
          item.role.permissions.map((entry) => entry.permission.code)
        )
      )
    );

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions
    };
  }

  private loadUserWithPermissions(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
      }
    });
  }

  private generateRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}