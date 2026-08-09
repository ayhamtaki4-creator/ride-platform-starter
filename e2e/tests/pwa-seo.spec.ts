import { expect, test } from "@playwright/test";

const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

test.describe("PWA and SEO foundation", () => {
  test("serves an installable Arabic manifest and offline shell", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      lang?: string;
      dir?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
    };

    expect(manifest.name).toBe("طريق الشام");
    expect(manifest.short_name).toBe("طريق الشام");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
    expect(
      manifest.icons?.some(
        (icon) => icon.type === "image/png" && icon.sizes === "192x192" && icon.purpose === "any",
      ),
    ).toBe(true);
    expect(
      manifest.icons?.some(
        (icon) => icon.type === "image/png" && icon.sizes === "512x512" && icon.purpose === "any",
      ),
    ).toBe(true);
    expect(
      manifest.icons?.some(
        (icon) => icon.type === "image/png" && icon.sizes === "512x512" && icon.purpose === "maskable",
      ),
    ).toBe(true);

    for (const iconPath of [
      "/icons/route-sham-192.png",
      "/icons/route-sham-512.png",
      "/icons/route-sham-maskable-512.png",
      "/icons/apple-touch-icon.png",
    ]) {
      const icon = await request.get(iconPath);
      expect(icon.status(), iconPath).toBe(200);
      expect(icon.headers()["content-type"]).toContain("image/png");
    }

    const worker = await request.get("/sw.js");
    expect(worker.status()).toBe(200);
    const workerText = await worker.text();
    expect(workerText).toContain("offline.html");
    expect(workerText).toContain("route-sham-192.png");

    const offline = await request.get("/offline.html");
    expect(offline.status()).toBe(200);
    expect(await offline.text()).toContain("لا يوجد اتصال بالإنترنت");
  });

  test("keeps private dashboards and share links out of robots", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const robotsText = await robots.text();
    expect(robotsText).toContain("Disallow: /admin/");
    expect(robotsText).toContain("Disallow: /driver/");
    expect(robotsText).toContain("Disallow: /rider/");
    expect(robotsText).toContain("Disallow: /track/");
    expect(robotsText).toContain(`Sitemap: ${expectedSiteUrl}/sitemap.xml`);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(expectedSiteUrl);
  });

  test("sends privacy headers on public tracking pages", async ({ request }) => {
    const response = await request.get("/track/privacy-smoke-token");
    expect(response.status()).toBe(200);

    // Next.js may replace a route-level no-store directive for the HTML shell
    // with no-cache/must-revalidate. Either policy prevents a reusable public
    // cache entry; the sensitive tracking JSON itself is protected by API
    // no-store headers.
    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toMatch(/(?:no-store|no-cache)/);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  });
});
