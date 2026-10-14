import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TEST123456";

const values = new Map<string, string>();
const appendedScripts: Array<{ src?: string; dataset: Record<string, string> }> = [];
const cookieWrites: string[] = [];

const fakeWindow = {
  location: { hostname: "tareeqalsham.com", origin: "https://tareeqalsham.com", pathname: "/", search: "" },
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
  dataLayer: undefined as unknown[][] | undefined,
  gtag: undefined as ((...args: unknown[]) => void) | undefined,
} as const;

const fakeDocument = {
  title: "طريق الشام",
  querySelector: (selector: string) =>
    selector === "script[data-tareeqalsham-analytics]" ? appendedScripts[0] ?? null : null,
  createElement: (_tag: string) => ({ src: "", async: false, dataset: {} }),
  head: { append: (script: { src?: string; dataset: Record<string, string> }) => { appendedScripts.push(script); } },
  get cookie() { return "_ga=sample; _ga_123=sample; app_session=safe"; },
  set cookie(value: string) { cookieWrites.push(value); },
};

Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true });

const analytics = await import("../apps/portal/lib/analytics.ts");

test("unconfigured consent refuses loading scripts or sending events", () => {
  assert.equal(analytics.analyticsConfigured(), true);
  assert.equal(analytics.readAnalyticsConsent(), null);
  assert.equal(analytics.initializeAnalytics(), false);
  analytics.trackBookingStarted("guest");
  assert.equal(appendedScripts.length, 0);
  assert.equal(fakeWindow.dataLayer, undefined);
});

test("loads GA4 only after consent and only on public routes", () => {
  analytics.writeAnalyticsConsent("accepted");
  assert.equal(analytics.initializeAnalytics(), true);
  assert.equal(appendedScripts.length, 1);
  assert.equal(appendedScripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-TEST123456");
  assert.equal(analytics.initializeAnalytics(), true);
  assert.equal(appendedScripts.length, 1);
  const config = fakeWindow.dataLayer!.find((row) => row[0] === "config");
  assert.equal(config?.[1], "G-TEST123456");
  assert.equal((config?.[2] as { send_page_view?: boolean }).send_page_view, false);
  assert.equal((config?.[2] as { allow_google_signals?: boolean }).allow_google_signals, false);
});

test("page views strip booking references and arbitrary query parameters", () => {
  fakeWindow.location.pathname = "/booking";
  fakeWindow.location.search = "?ref=GUEST-PRIVATE-REFERENCE&utm_source=facebook&utm_medium=paid&utm_campaign=airport_launch&phone=123";
  analytics.trackPublicPageView();
  const views = fakeWindow.dataLayer!.filter((row) => row[0] === "event" && row[1] === "page_view");
  assert.equal(views.length, 1);
  const params = views[0][2] as { page_path: string; page_location: string };
  assert.equal(params.page_path, "/booking");
  assert.equal(params.page_location, "https://tareeqalsham.com/booking?utm_source=facebook&utm_medium=paid&utm_campaign=airport_launch");
  assert.ok(!JSON.stringify(fakeWindow.dataLayer).includes("GUEST-PRIVATE-REFERENCE"));
  assert.ok(!JSON.stringify(fakeWindow.dataLayer).includes("phone"));
});

test("booking funnel uses only fixed event names and non-sensitive parameters", () => {
  analytics.trackBookingStarted("guest");
  analytics.trackBookingStepCompleted(1, "guest");
  analytics.trackBookingSubmitted("guest");
  const events = fakeWindow.dataLayer!.filter((row) =>
    row[0] === "event" && ["booking_started", "booking_step_completed", "booking_submitted"].includes(row[1] as string),
  );
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event[1]), ["booking_started", "booking_step_completed", "booking_submitted"]);
  assert.deepEqual(events[2][2], { booking_mode: "guest" });
  assert.deepEqual(events[1][2], { booking_mode: "guest", step_number: 1 });
});

test("private pages cannot send analytics even after consent", () => {
  for (const path of ["/admin", "/driver", "/rider", "/track/secret-token", "/booking/success", "/login", "/register"]) {
    assert.equal(analytics.isPublicAnalyticsPath(path), false);
    fakeWindow.location.pathname = path;
    const before = fakeWindow.dataLayer!.length;
    analytics.setAnalyticsRouteAllowed(false);
    analytics.trackPublicPageView();
    analytics.trackBookingSubmitted("guest");
    assert.equal(fakeWindow.dataLayer!.length, before);
  }
  assert.equal((fakeWindow as unknown as Record<string, unknown>)["ga-disable-G-TEST123456"], true);
});

test("revoking consent disables analytics and clears only analytics cookies", () => {
  fakeWindow.location.pathname = "/";
  analytics.writeAnalyticsConsent("rejected");
  assert.equal(analytics.readAnalyticsConsent(), "rejected");
  assert.equal((fakeWindow as unknown as Record<string, unknown>)["ga-disable-G-TEST123456"], true);
  const before = fakeWindow.dataLayer!.length;
  analytics.trackPublicPageView();
  assert.equal(fakeWindow.dataLayer!.length, before);
  assert.ok(cookieWrites.some((line) => line.startsWith("_ga=")));
  assert.ok(cookieWrites.some((line) => line.startsWith("_ga_123=")));
  assert.ok(cookieWrites.every((line) => !line.startsWith("app_session=")));
});
