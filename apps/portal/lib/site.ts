const LOCAL_SITE_URL = "http://localhost:3000";
const PRODUCTION_SITE_URL = "https://alnokhbaeducation.com";

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isSafeProductionSiteUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "0.0.0.0" &&
      hostname !== "::1"
    );
  } catch {
    return false;
  }
}

function resolveSiteUrl() {
  const configured = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || "");

  if (process.env.NODE_ENV === "production") {
    return isSafeProductionSiteUrl(configured)
      ? configured
      : PRODUCTION_SITE_URL;
  }

  return configured || LOCAL_SITE_URL;
}

export const SITE_URL = resolveSiteUrl();

export function absoluteSiteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}
