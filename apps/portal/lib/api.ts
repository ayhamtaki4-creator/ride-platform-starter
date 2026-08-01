const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
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

    if (response.status === 401 && !options.skipAuth && typeof window !== "undefined") {
      window.dispatchEvent(new Event("ride-auth-expired"));
    }

    throw new ApiError(message, response.status);
  }

  return body as T;
}
