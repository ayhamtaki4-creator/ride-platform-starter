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
// Detect the actual guest-claim *recovery* UI shipped after the original
// public booking release. Anonymous GET + JS asset inspection, no credentials.
try {
  const response = await fetch(new URL("/rider/bookings", base), {
    signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "tareeq-al-sham-release-check/1.0" },
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`My Bookings HTML returned ${response.status}`);
  const assetPaths = [...new Set(
    [...html.matchAll(/\/_next\/static\/chunks\/[^"'<>\\\s]+?\.js/g)].map(([path]) => path),
  )].slice(0, 45);
  if (!assetPaths.length) throw new Error("No Next.js route chunks found");
  const checks = await Promise.allSettled(assetPaths.map(async path => {
    const assetResponse = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
    if (!assetResponse.ok) return false;
    const content = await assetResponse.text();
    return content.includes("ربط حجوزات هذا الجهاز");
  }));
  const markerFound = checks.some(check => check.status === "fulfilled" && check.value);
  console.log(`${markerFound ? "PASS" : "FAIL"} latest guest-claim recovery UI: scanned ${assetPaths.length} Next.js chunks; recovery button marker=${markerFound}`);
  if (!markerFound) failed += 1;
} catch (error) {
  failed += 1;
  console.error(`FAIL guest-claim recovery UI marker: ${error instanceof Error ? error.message : String(error)}`);
}


/**
 * Release parity check: the cold-start booking experience is shipped in
 * client-side route chunks, not the SSR HTML. Scan public assets only.
 */
try {
  const response = await fetch(new URL("/booking", base), {
    signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "tareeq-al-sham-release-check/1.0" },
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Booking HTML returned ${response.status}`);
  const chunks = [...new Set(
    [...html.matchAll(/\/_next\/static\/chunks\/[^"'<>\\\s]+?\.js/g)].map(([url]) => url),
  )].slice(0, 60);
  if (!chunks.length) throw new Error("No booking JavaScript assets found");
  const probes = await Promise.allSettled(chunks.map(async path => {
    const asset = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
    if (!asset.ok) return false;
    const js = await asset.text();
    return js.includes("جارٍ تشغيل خدمة الحجز والاتصال بالخادم") &&
           js.includes("إعادة محاولة تحميل المسارات");
  }));
  const found = probes.some(item => item.status === "fulfilled" && item.value);
  console.log(`${found ? "PASS" : "FAIL"} Render cold-start booking UX on Cloudflare: scanned ${chunks.length} booking JS chunks; progress and retry=${found}`);
  if (!found) failed += 1;
} catch (error) {
  failed += 1;
  console.error(`FAIL cold-start booking UI: ${error instanceof Error ? error.message : String(error)}`);
}


/** Latest booking validation: public release bundle must contain wizard guards. */
try {
  const bookingUrl = new URL("/booking", base);
  const response = await fetch(bookingUrl, {
    signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "tareeq-al-sham-release-check/1.0" },
  });
  if (!response.ok) throw new Error(`Booking HTML returned ${response.status}`);
  const html = await response.text();
  const chunkPaths = [...new Set(
    [...html.matchAll(/\/_next\/static\/chunks\/[^"'<>\\\s]+?\.js/g)].map(([path]) => path),
  )].slice(0, 60);
  if (!chunkPaths.length) throw new Error("No booking JS chunks found");
  // Turbopack may put the step copy and validation helper into separate
  // chunks. Require BOTH markers across all route assets, not within one file.
  const matches = await Promise.allSettled(chunkPaths.map(async path => {
    const asset = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
    if (!asset.ok) return { phone: false, steps: false };
    const js = await asset.text();
    return {
      phone: js.includes("رقم الهاتف غير مكتمل أو غير صحيح"),
      steps: js.includes("للمتابعة: أدخل الاسم الكامل ورقم الهاتف الدولي الصحيح")
    };
  }));
  const phoneFound = matches.some(item => item.status === "fulfilled" && item.value.phone);
  const stepsFound = matches.some(item => item.status === "fulfilled" && item.value.steps);
  const validated = phoneFound && stepsFound;
  console.log(`${validated ? "PASS" : "FAIL"} Arabic phone validation and step requirements deployed: scanned ${chunkPaths.length} booking chunks; phone=${phoneFound}; guards=${stepsFound}`);
  if (!validated) failed += 1;
} catch (error) {
  failed += 1;
  console.error(`FAIL Arabic booking validation release: ${error instanceof Error ? error.message : String(error)}`);
}


if (failed) {
  console.error(`${failed} production checks did not pass. Do not consider Cloudflare published.`);
  process.exitCode = 1;
} else {
  console.log("Production public pages are reachable with the expected guest-booking UI.");
}
