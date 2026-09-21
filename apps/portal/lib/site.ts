const LOCAL_SITE_URL = "http://localhost:3000";
const PRODUCTION_SITE_URL = "https://alnokhbaeducation.com";

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

const fallbackSiteUrl =
  process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : LOCAL_SITE_URL;

export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || fallbackSiteUrl,
);

export function absoluteSiteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}
