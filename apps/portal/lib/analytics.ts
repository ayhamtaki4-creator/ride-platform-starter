// All outbound analytics must go through this narrowly scoped, consent-gated module.
// No visitor names, phone numbers, booking references, route IDs or free-text fields.
export type AnalyticsConsent = "accepted" | "rejected";

export const ANALYTICS_CONSENT_KEY = "tareeqalsham.analytics-consent.v1";
export const ANALYTICS_SETTINGS_EVENT = "tareeqalsham:open-analytics-settings";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,}$/;
const PUBLIC_SERVICE_PATHS = new Set([
  "/services/damascus-beirut-airport",
  "/services/damascus-amman-airport",
  "/services/damascus-airport-governorates",
]);

type GoogleAnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

function gtagWindow(): GoogleAnalyticsWindow {
  return window as GoogleAnalyticsWindow;
}

export function analyticsConfigured() {
  return MEASUREMENT_ID_PATTERN.test(measurementId);
}

export function isPublicAnalyticsPath(pathname: string) {
  return pathname === "/" ||
    pathname === "/booking" ||
    pathname === "/services" ||
    PUBLIC_SERVICE_PATHS.has(pathname) ||
    pathname === "/contact" ||
    pathname === "/privacy" ||
    pathname === "/terms";
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return stored === "accepted" || stored === "rejected" ? stored : null;
  } catch {
    // When storage is blocked, default to no analytics.
    return null;
  }
}

function disableAnalytics(disabled: boolean) {
  if (!analyticsConfigured() || typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = disabled;
}

function eraseAnalyticsCookies() {
  if (typeof document === "undefined") return;
  const names = document.cookie.split(";").map((part) => part.trim().split("=")[0]);
  const hostname = window.location.hostname;
  for (const name of names) {
    if (!/^_ga(?:_|$)|^_gid$/.test(name)) continue;
    for (const domain of ["", hostname, `.${hostname}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

export function writeAnalyticsConsent(choice: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  } catch {
    // Failed persistence must never be treated as permission to load analytics.
    return;
  }
  if (choice === "rejected") {
    disableAnalytics(true);
    eraseAnalyticsCookies();
  }
}

function analyticsAllowed() {
  return analyticsConfigured() &&
    typeof window !== "undefined" &&
    readAnalyticsConsent() === "accepted" &&
    isPublicAnalyticsPath(window.location.pathname);
}

export function setAnalyticsRouteAllowed(allowed: boolean) {
  disableAnalytics(!allowed || readAnalyticsConsent() !== "accepted");
}

export function initializeAnalytics() {
  if (!analyticsAllowed()) return false;
  disableAnalytics(false);
  const target = gtagWindow();
  if (document.querySelector("script[data-tareeqalsham-analytics]")) return true;

  target.dataLayer ??= [];
  target.gtag ??= (...args: unknown[]) => {
    target.dataLayer!.push(args);
  };
  target.gtag("js", new Date());
  target.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_flags: "SameSite=Lax;Secure",
    // Even automatic session events must not contain arbitrary URL query data.
    page_location: safePageLocation(),
    page_referrer: safeReferrer(),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.dataset.tareeqalshamAnalytics = "true";
  document.head.append(script);
  return true;
}

function safeReferrer() {
  // Keep external referral source domains but never full third-party query strings.
  // In particular, avoid a browser referrer containing /booking/success?ref=...
  try {
    const referrer = new URL(document.referrer);
    if (referrer.protocol !== "https:" && referrer.protocol !== "http:") return "";
    if (referrer.origin !== window.location.origin) return `${referrer.origin}/`;
    return isPublicAnalyticsPath(referrer.pathname)
      ? `${referrer.origin}${referrer.pathname}`
      : `${referrer.origin}/`;
  } catch {
    return "";
  }
}

function safePageLocation() {
  return `${window.location.origin}${window.location.pathname}${safeCampaignQuery()}`;
}

function safeCampaignQuery() {
  // Never send arbitrary query strings (e.g. ?ref=BOOKING_REFERENCE).
  const safe = new URLSearchParams();
  const query = new URLSearchParams(window.location.search);
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = query.get(key);
    if (value && /^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(value)) safe.set(key, value);
  }
  const encoded = safe.toString();
  return encoded ? `?${encoded}` : "";
}

export function trackPublicPageView() {
  if (!analyticsAllowed() || !initializeAnalytics()) return;
  const pathname = window.location.pathname;
  gtagWindow().gtag?.("event", "page_view", {
    page_path: pathname,
    page_location: safePageLocation(),
    page_referrer: safeReferrer(),
    page_title: document.title,
  });
}

function trackBookingEvent(name: "booking_started" | "booking_submitted" | "booking_step_completed", bookingMode: "guest" | "registered", stepNumber?: number) {
  if (!analyticsAllowed() || !initializeAnalytics()) return;
  gtagWindow().gtag?.("event", name, {
    booking_mode: bookingMode,
    ...(stepNumber === undefined ? {} : { step_number: stepNumber }),
  });
}

export function trackBookingStarted(bookingMode: "guest" | "registered") {
  trackBookingEvent("booking_started", bookingMode);
}

export function trackBookingStepCompleted(stepNumber: 1 | 2 | 3, bookingMode: "guest" | "registered") {
  trackBookingEvent("booking_step_completed", bookingMode, stepNumber);
}

export function trackBookingSubmitted(bookingMode: "guest" | "registered") {
  trackBookingEvent("booking_submitted", bookingMode);
}
