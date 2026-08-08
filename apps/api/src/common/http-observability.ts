import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_TOKEN_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;

export type HttpObservabilityOptions = {
  loggingEnabled: boolean;
  serviceName?: string;
};

export function createHttpObservabilityMiddleware(options: HttpObservabilityOptions) {
  const serviceName = options.serviceName ?? 'ride-platform-api';

  return (request: Request, response: Response, next: NextFunction) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();
    let logged = false;

    response.setHeader('X-Request-Id', requestId);

    const writeLog = (aborted: boolean) => {
      if (logged || !options.loggingEnabled) return;
      logged = true;

      const durationMs = Math.round(
        (Number(process.hrtime.bigint() - startedAt) / 1_000_000) * 10
      ) / 10;
      const route = resolveSafeRoute(request);
      const statusCode = response.statusCode;

      // Successful health probes are intentionally silent to avoid noisy production logs.
      if (!aborted && statusCode < 400 && isHealthRoute(route)) return;

      const entry = JSON.stringify({
        type: 'http_request',
        service: serviceName,
        requestId,
        method: request.method,
        route,
        statusCode,
        durationMs,
        outcome: aborted ? 'aborted' : 'completed'
      });

      if (statusCode >= 500 || aborted) console.error(entry);
      else console.log(entry);
    };

    response.once('finish', () => writeLog(false));
    response.once('close', () => {
      if (!response.writableFinished) writeLog(true);
    });

    next();
  };
}

export function resolveRequestId(headerValue: string | string[] | undefined) {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const normalized = candidate?.trim();
  return normalized && REQUEST_ID_PATTERN.test(normalized) ? normalized : randomUUID();
}

export function resolveSafeRoute(request: Request) {
  const routePath = (request as Request & { route?: { path?: unknown } }).route?.path;
  if (typeof routePath === 'string' && routePath.trim()) {
    return stripQuery(routePath).slice(0, 300);
  }

  const pathname = stripQuery(request.originalUrl || request.path || '/');
  return pathname
    .split('/')
    .map((segment) => sanitizeSegment(segment))
    .join('/')
    .slice(0, 300);
}

function sanitizeSegment(segment: string) {
  if (!segment) return segment;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the encoded segment if it is malformed.
  }

  if (UUID_SEGMENT.test(decoded)) return ':id';
  if (/^\d{4,}$/.test(decoded)) return ':number';
  if (LONG_TOKEN_SEGMENT.test(decoded)) return ':token';
  return decoded.length > 40 ? ':value' : decoded;
}

function stripQuery(value: string) {
  const questionMark = value.indexOf('?');
  return questionMark >= 0 ? value.slice(0, questionMark) : value;
}

function isHealthRoute(route: string) {
  return route === '/api/health' || route === '/api/health/ready';
}
