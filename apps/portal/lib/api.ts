import { optimizeMobileImageUpload } from "./mobile-image-upload";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const REFRESH_COOKIE_SESSION_HINT = "ride_refresh_cookie_session";
const REFRESH_TIMEOUT_MS = 12_000;
const READ_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const READ_RETRY_DELAY_MS = 500;
const MAX_RETRY_AFTER_MS = 3_000;
const RETRYABLE_READ_STATUSES = new Set([429, 502, 503, 504]);

export function getRealtimeUrl() {
  try {
    return `${new URL(API_URL).origin}/realtime`;
  } catch {
    return "http://localhost:4000/realtime";
  }
}

export class ApiError extends Error {
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    public readonly status: number,
    metadata: { retryAfterSeconds?: number; requestId?: string | null } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.retryAfterSeconds = metadata.retryAfterSeconds;
    this.requestId = metadata.requestId || undefined;
  }
}

export class AuthRefreshUnavailableError extends Error {
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(
    message = "تعذر تجديد الجلسة بسبب مشكلة اتصال مؤقتة.",
    metadata: {
      status?: number;
      retryAfterSeconds?: number;
      requestId?: string | null;
    } = {}
  ) {
    super(message);
    this.name = "AuthRefreshUnavailableError";
    this.status = metadata.status;
    this.retryAfterSeconds = metadata.retryAfterSeconds;
    this.requestId = metadata.requestId || undefined;
  }
}

class RequestTransportError extends Error {
  constructor(readonly kind: "timeout" | "network") {
    super(kind === "timeout" ? "request timeout" : "network failure");
    this.name = "RequestTransportError";
  }
}

type RefreshResponse = {
  accessToken: string;
  refreshToken?: string;
};

let refreshPromise: Promise<string | null> | null = null;

export function markRefreshCookieSession(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    localStorage.setItem(REFRESH_COOKIE_SESSION_HINT, "1");
  } else {
    localStorage.removeItem(REFRESH_COOKIE_SESSION_HINT);
  }
}

export function clearStoredAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("ride_access_token");
  localStorage.removeItem("ride_refresh_token");
  localStorage.removeItem("ride_user");
  localStorage.removeItem(REFRESH_COOKIE_SESSION_HINT);
}

export async function refreshAccessToken() {
  if (typeof window === "undefined") return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const legacyRefreshToken = localStorage.getItem("ride_refresh_token");
    const hasCookieSessionHint =
      localStorage.getItem(REFRESH_COOKIE_SESSION_HINT) === "1";
    if (!legacyRefreshToken && !hasCookieSessionHint) return null;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}
        ),
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (caught) {
      throw new AuthRefreshUnavailableError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "انتهت مهلة الاتصال أثناء محاولة تجديد الجلسة."
          : "تعذر الاتصال بالخادم أثناء محاولة تجديد الجلسة."
      );
    } finally {
      window.clearTimeout(timeout);
    }

    if (!response.ok) {
      // These statuses mean the stored refresh credential is missing/invalid.
      // Only then may callers treat the session as truly expired.
      if ([400, 401, 403].includes(response.status)) return null;

      throw new AuthRefreshUnavailableError(
        "تعذر تجديد الجلسة مؤقتًا. سنحافظ على الجلسة ونحاول مرة أخرى.",
        {
          status: response.status,
          retryAfterSeconds: readRetryAfterSeconds(response, null),
          requestId: response.headers.get("X-Request-Id"),
        }
      );
    }

    const body = (await response.json().catch(() => null)) as RefreshResponse | null;
    if (!body?.accessToken) {
      throw new AuthRefreshUnavailableError(
        "استجابة تجديد الجلسة غير مكتملة. سنحافظ على الجلسة ونحاول مرة أخرى.",
        {
          status: response.status,
          requestId: response.headers.get("X-Request-Id"),
        }
      );
    }

    localStorage.setItem("ride_access_token", body.accessToken);
    if (body.refreshToken) {
      localStorage.setItem("ride_refresh_token", body.refreshToken);
      markRefreshCookieSession(false);
    } else {
      localStorage.removeItem("ride_refresh_token");
      markRefreshCookieSession(true);
    }
    window.dispatchEvent(new Event("ride-auth-refreshed"));
    return body.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

type ApiOptions = RequestInit & {
  token?: string | null;
  skipAuth?: boolean;
  retryAuth?: boolean;
  timeoutMs?: number;
};

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token =
    options.token ??
    (typeof window !== "undefined"
      ? localStorage.getItem("ride_access_token")
      : null);

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const {
    token: _token,
    skipAuth: _skipAuth,
    retryAuth: _retryAuth,
    timeoutMs,
    ...requestOptions
  } = options;
  const method = (requestOptions.method ?? "GET").toUpperCase();

  let response: Response;
  try {
    response = await fetchWithMobileResilience(
      `${API_URL}${path}`,
      {
        ...requestOptions,
        headers,
        credentials: requestOptions.credentials ?? "include",
        cache: "no-store",
      },
      timeoutMs ?? defaultTimeoutForMethod(method)
    );
  } catch (caught) {
    if (caught instanceof RequestTransportError) {
      throw new ApiError(
        caught.kind === "timeout"
          ? "استغرق الاتصال وقتًا أطول من المتوقع. تحقق من الشبكة وحاول مجددًا."
          : "تعذر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.",
        0
      );
    }
    throw caught;
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    let message = "تعذر إكمال الطلب.";

    if (body && typeof body === "object" && "message" in body) {
      const rawMessage = (body as { message?: unknown }).message;

      if (Array.isArray(rawMessage)) {
        message = rawMessage.map(String).join("، ");
      } else if (typeof rawMessage === "string") {
        message = rawMessage;
      }
    }

    if (response.status === 401 && !options.skipAuth && options.retryAuth !== false) {
      // refreshAccessToken intentionally throws for transient network/5xx/429
      // failures. In that case we keep local auth intact instead of turning a
      // temporary Render outage into a permanent logout.
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        return apiFetch<T>(path, {
          ...options,
          token: refreshedToken,
          retryAuth: false,
        });
      }

      if (typeof window !== "undefined") {
        clearStoredAuth();
        window.dispatchEvent(new Event("ride-auth-expired"));
      }
    }

    const retryAfterSeconds = readRetryAfterSeconds(response, body);
    throw new ApiError(message, response.status, {
      retryAfterSeconds,
      requestId: response.headers.get("X-Request-Id"),
    });
  }

  return body as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: Omit<ApiOptions, "body" | "method"> = {}
): Promise<T> {
  if (path.startsWith("/bookings/flight-ticket")) {
    const candidate = formData.get("file");
    if (typeof File !== "undefined" && candidate instanceof File) {
      const optimized = await optimizeMobileImageUpload(candidate);
      if (optimized.optimized) formData.set("file", optimized.file);
    }
  }

  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    body: formData,
    timeoutMs: options.timeoutMs ?? UPLOAD_TIMEOUT_MS,
  });
}

export async function fetchProtectedBlob(pathOrUrl: string, retry = true): Promise<Blob> {
  const token = typeof window !== "undefined" ? localStorage.getItem("ride_access_token") : null;
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_URL}${pathOrUrl}`;

  let response: Response;
  try {
    response = await fetchWithMobileResilience(
      url,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
        cache: "no-store",
      },
      UPLOAD_TIMEOUT_MS
    );
  } catch (caught) {
    if (caught instanceof RequestTransportError) {
      throw new ApiError(
        caught.kind === "timeout"
          ? "استغرق فتح الملف وقتًا أطول من المتوقع. تحقق من الشبكة وحاول مجددًا."
          : "تعذر الاتصال بالخادم لفتح الملف. تحقق من الإنترنت وحاول مجددًا.",
        0
      );
    }
    throw caught;
  }

  if (response.status === 401 && retry) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) return fetchProtectedBlob(pathOrUrl, false);
    if (typeof window !== "undefined") {
      clearStoredAuth();
      window.dispatchEvent(new Event("ride-auth-expired"));
    }
  }
  if (!response.ok) {
    throw new ApiError("تعذر فتح الملف.", response.status, {
      retryAfterSeconds: readRetryAfterSeconds(response, null),
      requestId: response.headers.get("X-Request-Id"),
    });
  }
  return response.blob();
}

async function fetchWithMobileResilience(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const method = (init.method ?? "GET").toUpperCase();
  const safeRead = method === "GET" || method === "HEAD";
  const maxAttempts = safeRead ? 2 : 1;
  const externalSignal = init.signal ?? undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (externalSignal?.aborted) throw abortReason(externalSignal);

    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, timeoutMs));

    let response: Response | null = null;
    let caughtError: unknown;

    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (caught) {
      caughtError = caught;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    if (response) {
      const canRetryStatus =
        safeRead &&
        attempt + 1 < maxAttempts &&
        RETRYABLE_READ_STATUSES.has(response.status);

      if (!canRetryStatus) return response;

      await response.body?.cancel().catch(() => undefined);
      await waitForRetry(retryDelayMs(response), externalSignal);
      continue;
    }

    if (externalSignal?.aborted) throw abortReason(externalSignal);

    if (safeRead && attempt + 1 < maxAttempts) {
      await waitForRetry(READ_RETRY_DELAY_MS, externalSignal);
      continue;
    }

    if (timedOut) throw new RequestTransportError("timeout");
    if (caughtError) throw new RequestTransportError("network");
    throw new RequestTransportError("network");
  }

  throw new RequestTransportError("network");
}

function defaultTimeoutForMethod(method: string) {
  return method === "GET" || method === "HEAD"
    ? READ_TIMEOUT_MS
    : MUTATION_TIMEOUT_MS;
}

function retryDelayMs(response: Response) {
  const raw = response.headers.get("Retry-After")?.trim();
  if (!raw) return READ_RETRY_DELAY_MS;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
  }

  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    return Math.min(
      MAX_RETRY_AFTER_MS,
      Math.max(0, dateMs - Date.now())
    );
  }

  return READ_RETRY_DELAY_MS;
}

function waitForRetry(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(signal ? abortReason(signal) : new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("Aborted", "AbortError");
}

function readRetryAfterSeconds(response: Response, body: unknown) {
  const headerValue = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  if (Number.isInteger(headerValue) && headerValue > 0) return headerValue;

  if (body && typeof body === "object" && "retryAfterSeconds" in body) {
    const raw = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);
  }
  return undefined;
}
