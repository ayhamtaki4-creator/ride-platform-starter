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
      icons?: Array<{ src?: string; purpose?: string }>;
    };

    expect(manifest.name).toBe("طريق الشام");
    expect(manifest.short_name).toBe("طريق الشام");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);

    const worker = await request.get("/sw.js");
    expect(worker.status()).toBe(200);
    expect(await worker.text()).toContain("offline.html");

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
});
