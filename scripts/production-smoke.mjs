const API_BASE_URL = trimTrailingSlash(
  process.env.PRODUCTION_API_URL || "https://ride-platform-starter.onrender.com/api",
);
const PORTAL_BASE_URL = trimTrailingSlash(
  process.env.PRODUCTION_PORTAL_URL || "https://alnokhbaeducation.com",
);
const REQUEST_TIMEOUT_MS = numberSetting("PRODUCTION_SMOKE_TIMEOUT_MS", 45_000);
const SLOW_REQUEST_MS = numberSetting("PRODUCTION_SMOKE_SLOW_MS", 8_000);
const portalOrigin = new URL(PORTAL_BASE_URL).origin;

const checks = [];
let failed = false;

function trimTrailingSlash(value) {
  return value.trim().replace(/\/+$/, "");
}

function numberSetting(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function record(name, status, detail, elapsedMs) {
  checks.push({ name, status, detail, elapsedMs });
  const icon = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  const timing = Number.isFinite(elapsedMs) ? ` (${elapsedMs} ms)` : "";
  console.log(`[${icon}] ${name}${timing}${detail ? ` - ${detail}` : ""}`);
  if (status === "fail") failed = true;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchTimed(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "ride-platform-production-smoke/1.0",
        ...(init.headers || {}),
      },
    });
    return { response, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function responseText(response) {
  const body = await response.text();
  return body.length > 1_000_000 ? body.slice(0, 1_000_000) : body;
}

async function responseJson(response) {
  const text = await responseText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`expected JSON but received ${text.slice(0, 180) || "an empty body"}`);
  }
}

function markSlow(name, elapsedMs) {
  if (elapsedMs > SLOW_REQUEST_MS) {
    record(name, "warn", `slow response above ${SLOW_REQUEST_MS} ms`, elapsedMs);
  }
}

async function run(name, task) {
  try {
    const result = await task();
    record(name, "pass", result.detail || "ok", result.elapsedMs);
    markSlow(`${name} latency`, result.elapsedMs);
  } catch (error) {
    record(
      name,
      "fail",
      error instanceof Error ? error.message : String(error),
      undefined,
    );
  }
}

await run("API liveness", async () => {
  const { response, elapsedMs } = await fetchTimed(`${API_BASE_URL}/health`);
  assert(response.status === 200, `HTTP ${response.status}`);
  const body = await responseJson(response);
  assert(body?.status === "ok", `unexpected status ${String(body?.status)}`);
  assert(body?.service === "ride-platform-api", `unexpected service ${String(body?.service)}`);
  assert(
    response.headers.get("cache-control")?.includes("no-store"),
    "health response is missing Cache-Control: no-store",
  );
  return { elapsedMs, detail: `uptime=${String(body?.uptimeSeconds ?? "?")}s` };
});

await run("API readiness", async () => {
  const { response, elapsedMs } = await fetchTimed(`${API_BASE_URL}/health/ready`);
  const body = await responseJson(response);
  assert(response.status === 200, `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  assert(["ok", "degraded"].includes(body?.status), `unexpected readiness ${String(body?.status)}`);
  assert(body?.checks?.database?.status === "ok", "database readiness is not ok");
  if (body?.checks?.redis?.required) {
    assert(body?.checks?.redis?.status === "ok", "required Redis readiness is not ok");
  }
  return {
    elapsedMs,
    detail: `database=${String(body?.checks?.database?.status)}, redis=${String(body?.checks?.redis?.status)}`,
  };
});

await run("API production security headers", async () => {
  const { response, elapsedMs } = await fetchTimed(`${API_BASE_URL}/health`);
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(response.headers.get("x-content-type-options") === "nosniff", "missing X-Content-Type-Options: nosniff");
  assert(response.headers.get("x-frame-options") === "DENY", "missing X-Frame-Options: DENY");
  assert(response.headers.get("referrer-policy") === "no-referrer", "missing Referrer-Policy: no-referrer");
  assert(response.headers.get("strict-transport-security"), "missing Strict-Transport-Security");
  return { elapsedMs, detail: "security headers present" };
});

await run("Portal CORS preflight", async () => {
  const { response, elapsedMs } = await fetchTimed(`${API_BASE_URL}/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: portalOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert([200, 204].includes(response.status), `HTTP ${response.status}`);
  assert(
    response.headers.get("access-control-allow-origin") === portalOrigin,
    `Access-Control-Allow-Origin is ${String(response.headers.get("access-control-allow-origin"))}, expected ${portalOrigin}`,
  );
  assert(
    response.headers.get("access-control-allow-credentials") === "true",
    "Access-Control-Allow-Credentials is not true",
  );
  return { elapsedMs, detail: portalOrigin };
});

await run("Public routes API", async () => {
  const { response, elapsedMs } = await fetchTimed(`${API_BASE_URL}/routes`, {
    headers: { origin: portalOrigin },
  });
  assert(response.status === 200, `HTTP ${response.status}`);
  const body = await responseJson(response);
  assert(Array.isArray(body), "routes payload is not an array");
  assert(body.length > 0, "no public bookable routes are configured");
  assert(
    body.every((route) => Array.isArray(route?.bookingTypes) && route.bookingTypes.includes("PRIVATE_CAR")),
    "a public route is not PRIVATE_CAR bookable",
  );
  assert(
    response.headers.get("access-control-allow-origin") === portalOrigin,
    "public routes response does not allow the production portal origin",
  );
  return { elapsedMs, detail: `${body.length} bookable route(s)` };
});

await run("Portal home identity and canonical metadata", async () => {
  const { response, elapsedMs } = await fetchTimed(`${PORTAL_BASE_URL}/`);
  assert(response.status === 200, `HTTP ${response.status}`);
  const html = await responseText(response);
  assert(html.includes("طريق الشام"), "production home does not contain the ride-platform brand 'طريق الشام'");
  assert(!html.includes("منصة النخبة التعليمية"), "production home still serves the old education platform");
  assert(
    html.includes(PORTAL_BASE_URL),
    "production home metadata does not reference the configured portal origin",
  );
  assert(
    !html.includes("http://localhost:3000"),
    "production home metadata still references localhost",
  );
  return { elapsedMs, detail: new URL(response.url).origin };
});

await run("Portal booking registration gate", async () => {
  const bookingResult = await fetchTimed(`${PORTAL_BASE_URL}/booking`);
  assert(bookingResult.response.status === 200, `booking HTTP ${bookingResult.response.status}`);
  const bookingHtml = await responseText(bookingResult.response);
  assert(
    bookingHtml.includes("جارٍ التحقق من الجلسة") || bookingHtml.includes("جارٍ تحويلك إلى الصفحة المناسبة"),
    "anonymous booking route does not expose the expected authentication gate",
  );

  const registerResult = await fetchTimed(`${PORTAL_BASE_URL}/register?next=%2Fbooking`);
  assert(registerResult.response.status === 200, `register HTTP ${registerResult.response.status}`);
  const registerHtml = await responseText(registerResult.response);
  assert(registerHtml.includes("إنشاء حساب مسافر"), "registration page is missing passenger account content");
  assert(
    registerHtml.includes("رقم WhatsApp مع رمز الدولة"),
    "registration page is missing the international phone field",
  );

  return {
    elapsedMs: bookingResult.elapsedMs + registerResult.elapsedMs,
    detail: "anonymous booking is gated and passenger registration is available",
  };
});

await run("Portal robots.txt", async () => {
  const { response, elapsedMs } = await fetchTimed(`${PORTAL_BASE_URL}/robots.txt`);
  assert(response.status === 200, `HTTP ${response.status}`);
  const text = await responseText(response);
  assert(/user-agent:/i.test(text), "robots.txt has no User-agent directive");
  assert(
    text.includes(`${PORTAL_BASE_URL}/sitemap.xml`),
    "robots.txt sitemap points at the wrong portal origin",
  );
  assert(!text.includes("http://localhost:3000"), "robots.txt still references localhost");
  return { elapsedMs, detail: "robots canonical origin is correct" };
});

await run("Portal sitemap.xml", async () => {
  const { response, elapsedMs } = await fetchTimed(`${PORTAL_BASE_URL}/sitemap.xml`);
  assert(response.status === 200, `HTTP ${response.status}`);
  const text = await responseText(response);
  assert(text.includes("<urlset") || text.includes("<sitemapindex"), "sitemap.xml is not a sitemap document");
  assert(text.includes(PORTAL_BASE_URL), "sitemap does not use the configured production portal URL");
  assert(text.includes(`${PORTAL_BASE_URL}/booking`), "sitemap does not include the booking page");
  assert(!text.includes("http://localhost:3000"), "sitemap still references localhost");
  return { elapsedMs, detail: "home and booking URLs use production origin" };
});

console.log("\nProduction smoke summary");
console.log(`API:    ${API_BASE_URL}`);
console.log(`Portal: ${PORTAL_BASE_URL}`);
console.log(`Passed: ${checks.filter((check) => check.status === "pass").length}`);
console.log(`Warnings: ${checks.filter((check) => check.status === "warn").length}`);
console.log(`Failed: ${checks.filter((check) => check.status === "fail").length}`);

if (failed) process.exitCode = 1;
