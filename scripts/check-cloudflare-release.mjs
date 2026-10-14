/**
 * Public, read-only smoke check for the existing Cloudflare-hosted website.
 * Does not create bookings, expose booking details, require login, or modify DNS.
 *
 *   node scripts/check-cloudflare-release.mjs
 *   PRODUCTION_PORTAL_URL=https://tareeqalsham.com node scripts/check-cloudflare-release.mjs
 */
const base = (process.env.PRODUCTION_PORTAL_URL || "https://tareeqalsham.com").replace(/\/+$/, "");
const cases = [
  { pathname: "/", label: "public homepage", expected: /طريق الشام|Tareeq|SHAM/i },
  { pathname: "/booking", label: "anonymous booking page", expected: /احجز|الحجز|booking/i },
  {
    pathname: "/booking/success?ref=TS-CHECK",
    label: "guest receipt and account invitation",
    expected: /إذا أردت الاستفادة من باقي مزايا الموقع|تسجيل الدخول أو إنشاء حساب/,
  },
];
let failed = 0;
for (const test of cases) {
  const url = new URL(test.pathname, base);
  let response;
  let text;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
      headers: { "user-agent": "tareeq-al-sham-release-check/1.0" },
    });
    text = await response.text();
    const containsExpected = test.expected.test(text);
    const okay = response.ok && containsExpected && !/\/login(?:\?|$)/.test(new URL(response.url).pathname);
    console.log(
      `${okay ? "PASS" : "FAIL"} ${test.label}: HTTP ${response.status}; ${response.url}; Cloudflare-Ray=${response.headers.get("cf-ray") || "not-provided"}; HTML marker=${containsExpected}`
    );
    if (!okay) failed += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${test.label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failed) {
  console.error(`${failed} production checks did not pass. Do not consider Cloudflare published.`);
  process.exitCode = 1;
} else {
  console.log("Production public pages are reachable with the expected guest-booking UI.");
}
