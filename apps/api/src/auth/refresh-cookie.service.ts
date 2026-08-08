import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

@Injectable()
export class RefreshCookieService {
  readonly enabled: boolean;
  private readonly cookieName: string;
  private readonly options: CookieOptions;

  constructor(private readonly config: ConfigService) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development').trim().toLowerCase();
    this.enabled = this.readBoolean('AUTH_REFRESH_COOKIE_ENABLED', false);
    this.cookieName =
      this.config.get<string>('AUTH_REFRESH_COOKIE_NAME')?.trim() || 'ride_refresh_token';

    const secure = this.readBoolean('AUTH_REFRESH_COOKIE_SECURE', nodeEnv === 'production');
    const sameSiteRaw =
      this.config.get<string>('AUTH_REFRESH_COOKIE_SAME_SITE')?.trim().toLowerCase() || 'lax';
    const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw)
      ? (sameSiteRaw as 'lax' | 'strict' | 'none')
      : 'lax';

    if (this.enabled && sameSite === 'none' && !secure) {
      throw new Error('AUTH_REFRESH_COOKIE_SAME_SITE=none requires AUTH_REFRESH_COOKIE_SECURE=true.');
    }

    const refreshDays = Math.max(
      1,
      Number(this.config.get<string>('REFRESH_TOKEN_EXPIRES_DAYS') ?? '30') || 30
    );
    const domain = this.config.get<string>('AUTH_REFRESH_COOKIE_DOMAIN')?.trim();

    this.options = {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
      ...(domain ? { domain } : {})
    };
  }

  read(request: Request) {
    const rawCookie = request.headers.cookie;
    if (!rawCookie) return null;

    for (const part of rawCookie.split(';')) {
      const separator = part.indexOf('=');
      if (separator <= 0) continue;
      const name = part.slice(0, separator).trim();
      if (name !== this.cookieName) continue;
      const rawValue = part.slice(separator + 1).trim();
      if (!rawValue) return null;
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
    return null;
  }

  set(response: Response, refreshToken: string) {
    if (!this.enabled) return;
    response.cookie(this.cookieName, refreshToken, this.options);
  }

  clear(response: Response) {
    if (!this.enabled) return;
    const { maxAge: _maxAge, ...clearOptions } = this.options;
    response.clearCookie(this.cookieName, clearOptions);
  }

  present<T extends { refreshToken: string }>(response: Response, session: T): T | Omit<T, 'refreshToken'> {
    if (!this.enabled) return session;
    this.set(response, session.refreshToken);
    const { refreshToken: _refreshToken, ...safeSession } = session;
    return safeSession;
  }

  private readBoolean(name: string, fallback: boolean) {
    const raw = this.config.get<string>(name)?.trim().toLowerCase();
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }
}
