// Live, ephemeral, privacy-safe probe: checks that consenting to analytics on the
// public homepage actually triggers a GA4 network request. Makes NO reservations.
import { chromium } from "@playwright/test";

const url = "https://tareeqalsham.com/";
const measurementId = "G-QGRC5QFLSW";
const browser = await chromium.launch({ headless: true });
const seen = [];
const failures = [];
const pageErrors = [];
let report = {};
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 840 },
    locale: "ar-SY",
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  page.on("request", (request) => {
    try {
      const target = new URL(request.url());
      if (/googletagmanager\.com|google-analytics\.com/.test(target.hostname)) {
        seen.push({
          stage: "request",
          domain: target.hostname,
          path: target.pathname,
          tid: target.searchParams.get("tid"),
          event: target.searchParams.get("en"),
          // Do not log a Google client-id or arbitrary URL query data.
        });
      }
    } catch {}
  });
  page.on("response", (response) => {
    try {
      const target = new URL(response.url());
      if (/googletagmanager\.com|google-analytics\.com/.test(target.hostname)) {
        seen.push({ stage: "response", domain: target.hostname, path: target.pathname, status: response.status() });
      }
    } catch {}
  });
  page.on("requestfailed", (request) => {
    try {
      const target = new URL(request.url());
      if (/googletagmanager\.com|google-analytics\.com/.test(target.hostname)) {
        failures.push({ domain: target.hostname, path: target.pathname, failure: request.failure()?.errorText });
      }
    } catch {}
  });
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 200)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const consentButton = page.getByRole("button", { name: "السماح بالتحليلات" });
  try {
    await consentButton.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    report = {
      step: "consent-not-visible",
      title: await page.title(),
      currentPath: new URL(page.url()).pathname,
      preferenceLink: await page.getByText("إعدادات خصوصية التحليلات").count(),
      browserErrors: pageErrors,
    };
    throw new Error("Analytics consent banner did not appear in a fresh browser.");
  }
  await consentButton.click();
  await page.waitForTimeout(13000);
  const jsState = await page.evaluate((id) => ({
    accepted: localStorage.getItem("tareeqalsham.analytics-consent.v1"),
    gaDisabled: window["ga-disable-" + id] === true,
    gtagPresent: typeof window.gtag === "function",
    dataLayerCalls: (window.dataLayer || []).map((entry) => ({
      // Avoid outputting any user-related event payload.
      method: entry[0],
      event: entry[0] === "event" ? entry[1] : undefined,
      property: entry[0] === "config" ? entry[1] : undefined,
    })),
    gtagScripts: [...document.querySelectorAll("script")].filter(s => /googletagmanager\.com\/gtag/.test(s.src)).map(s=>new URL(s.src).hostname),
  }), measurementId);
  report = { consentWasVisible: true, jsState, seen, failures, browserErrors: pageErrors };
  console.log("ANALYTICS_LIVE_PROBE " + JSON.stringify(report, null, 2));
  if (!jsState.gtagPresent) throw new Error("gtag not initialized");
  if (!seen.some(x => x.domain.includes("google-analytics.com") && /\/g\/collect/.test(x.path))) {
    throw new Error("Browser did not send a GA4 /g/collect request after consent");
  }
} catch (error) {
  console.error("ANALYTICS_LIVE_PROBE_FAILED " + JSON.stringify(report, null, 2));
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
