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
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthUser } from './auth-user.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('يلزم تسجيل الدخول.');
    }

    try {
      request.user = this.jwtService.verify<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('رمز الدخول غير صالح أو منتهي.');
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]) ?? [];

    if (required.length === 0) return true;

    const granted = new Set(request.user.permissions);
    const allowed = required.every((permission) => granted.has(permission));

    if (!allowed) {
      throw new ForbiddenException('لا تملك الصلاحية المطلوبة.');
    }

    return true;
  }
}
