export function normalizePublicMediaUrl(rawUrl?: string | null) {
  const value = rawUrl?.trim();
  if (!value) return null;

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const apiOrigin = configured
    ? configured.replace(/\/api\/?$/, "").replace(/\/+$/, "")
    : typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : "";

  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const parsed = new URL(value);
      if (
        typeof window !== "undefined" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        if (apiOrigin) return `${apiOrigin}${parsed.pathname}${parsed.search}`;
        parsed.hostname = window.location.hostname;
      }
      return parsed.toString();
    }
    if (value.startsWith("/") && apiOrigin) return `${apiOrigin}${value}`;
    return value;
  } catch {
    return value;
  }
}
