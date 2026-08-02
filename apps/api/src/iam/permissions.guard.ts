import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user.type';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

type TokenPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket clients are authenticated inside RealtimeGateway.
    if (context.getType() === 'ws') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : undefined;

    if (!token) {
      throw new UnauthorizedException('يلزم تسجيل الدخول.');
    }

    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('رمز الدخول غير صالح أو منتهي.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('الحساب غير نشط أو لم يعد موجودًا.');
    }

    const roles: string[] = user.roles.map((item) => item.role.code);
    const permissions: string[] = Array.from(
      new Set<string>(
        user.roles.flatMap((item) =>
          item.role.permissions.map((entry) => entry.permission.code)
        )
      )
    );

    request.user = {
      sub: user.id,
      email: user.email,
      roles,
      permissions
    };

    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (required.length === 0) return true;

    const granted = new Set(permissions);
    const allowed = required.every((permission) => granted.has(permission));

    if (!allowed) {
      throw new ForbiddenException('لا تملك الصلاحية المطلوبة.');
    }

    return true;
  }
}
