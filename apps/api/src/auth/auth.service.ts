import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async registerPassenger(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('البريد الإلكتروني مستخدم مسبقًا.');
    }

    const passengerRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: 'PASSENGER' }
    });

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
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

    return this.issueToken(user.id);
  }

  async login(dto: LoginDto) {
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

    return this.issueToken(user.id);
  }

  current(user: AuthUser) {
    return this.loadUserView(user.sub);
  }

  private async issueToken(userId: string) {
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
      email: user.email,
      roles,
      permissions
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
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
}
