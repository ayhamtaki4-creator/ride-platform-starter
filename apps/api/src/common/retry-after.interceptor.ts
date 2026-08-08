import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, catchError, throwError } from 'rxjs';

@Injectable()
export class RetryAfterInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException && error.getStatus() === 429) {
          const retryAfterSeconds = readRetryAfterSeconds(error.getResponse());
          if (retryAfterSeconds !== null && !response.headersSent) {
            response.setHeader('Retry-After', String(retryAfterSeconds));
          }
        }
        return throwError(() => error);
      })
    );
  }
}

function readRetryAfterSeconds(value: string | object) {
  if (!value || typeof value !== 'object' || !('retryAfterSeconds' in value)) {
    return null;
  }

  const raw = (value as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.ceil(numeric));
}
