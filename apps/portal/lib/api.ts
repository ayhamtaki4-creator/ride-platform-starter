export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function getRealtimeUrl() {
  try {
    return `${new URL(API_URL).origin}/realtime`;
  } catch {
    return "http://localhost:4000/realtime";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = RequestInit & {
  token?: string | null;
  skipAuth?: boolean;
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

  const { token: _token, skipAuth: _skipAuth, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers,
    cache: "no-store",
  });

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

    if (
      response.status === 401 &&
      !options.skipAuth &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event("ride-auth-expired"));
    }

    throw new ApiError(message, response.status);
  }

  return body as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: Omit<ApiOptions, "body" | "method"> = {}
): Promise<T> {
  return apiFetch<T>(path, { ...options, method: "POST", body: formData });
}

export async function fetchProtectedBlob(pathOrUrl: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("ride_access_token") : null;
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError("تعذر فتح الملف.", response.status);
  return response.blob();
}
