import { expect, test } from "@playwright/test";

const expectedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

test.describe("PWA and SEO foundation", () => {
  test("serves an installable Arabic manifest and offline shell", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()["cache-control"]).toContain("no-cache");
    const manifest = (await manifestResponse.json()) as {
      id?: string;
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      lang?: string;
      dir?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
    };

    expect(manifest.id).toBe("/");
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
    expect(worker.headers()["cache-control"]).toContain("no-cache");
    expect(worker.headers()["cache-control"]).toContain("no-store");
    expect(worker.headers()["service-worker-allowed"]).toBe("/");
    const workerText = await worker.text();
    expect(workerText).toContain("offline.html");
    expect(workerText).toContain("route-sham-192.png");
    expect(workerText).toContain('addEventListener("push"');
    expect(workerText).toContain("showNotification");
    expect(workerText).toContain('addEventListener("notificationclick"');
    expect(workerText).toContain("route-sham.push-received");

    const offline = await request.get("/offline.html");
    expect(offline.status()).toBe(200);
    expect(offline.headers()["cache-control"]).toContain("no-cache");
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

  test("publishes indexable route-specific service pages and legal/contact pages", async ({ request }) => {
    const indexedPaths = [
      "/",
      "/booking",
      "/services",
      "/services/damascus-beirut-airport",
      "/services/damascus-amman-airport",
      "/services/damascus-airport-governorates",
      "/contact",
      "/privacy",
      "/terms",
    ];
    const sitemapResponse = await request.get("/sitemap.xml");
    expect(sitemapResponse.status()).toBe(200);
    const sitemapText = await sitemapResponse.text();

    for (const path of indexedPaths) {
      const canonical = path === "/" ? expectedSiteUrl : `${expectedSiteUrl}${path}`;
      expect(sitemapText).toContain(`<loc>${canonical}</loc>`);
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain(`href="${canonical}"`);
    }

    for (const excluded of ["/admin", "/driver", "/rider", "/track", "/login", "/register"]) {
      expect(sitemapText).not.toContain(`<loc>${expectedSiteUrl}${excluded}`);
    }
  });

  test("adds structured organization and service descriptions without hardcoded fares", async ({ request }) => {
    const home = await (await request.get("/")).text();
    expect(home).toContain('application/ld+json');
    expect(home).toContain('"@type":"Organization"');
    expect(home).toContain('"@type":"WebSite"');

    const service = await (await request.get("/services/damascus-beirut-airport")).text();
    expect(service).toContain('"@type":"Service"');
    expect(service).toContain('سيارة خاصة بين دمشق ومطار بيروت');
    expect(service).toContain('href="/booking"');
  });

  test("renders route-specific search landing pages with useful directions and crawlable related links", async ({ request }) => {
    const cases = [
      {
        slug: "damascus-beirut-airport",
        title: "سيارة من دمشق إلى مطار بيروت والعكس",
        outbound: "من دمشق إلى مطار بيروت",
        inbound: "من مطار بيروت إلى دمشق",
      },
      {
        slug: "damascus-amman-airport",
        title: "سيارة من دمشق إلى مطار الملكة علياء والعكس",
        outbound: "من دمشق إلى مطار الملكة علياء",
        inbound: "من مطار الملكة علياء إلى دمشق",
      },
      {
        slug: "damascus-airport-governorates",
        title: "توصيل مطار دمشق الدولي إلى المحافظات والعكس",
        outbound: "من مطار دمشق الدولي إلى المحافظات السورية",
        inbound: "من المحافظات إلى مطار دمشق الدولي",
      },
    ];

    for (const item of cases) {
      const path = `/services/${item.slug}`;
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      const canonical = `${expectedSiteUrl}${path}`;
      expect(html).toContain(item.title);
      expect(html).toContain(item.outbound);
      expect(html).toContain(item.inbound);
      expect(html).toContain("معلومات مهمة قبل السفر");
      expect(html).toContain("مسارات أخرى قد تهمك");
      expect(html).toContain(`href="${canonical}"`);
      expect(html).toContain('"@type":"Service"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('"itemListElement"');
      expect(html).toContain('href="/booking"');
      expect(html).toContain("لا");
      for (const other of cases.filter((route) => route.slug !== item.slug)) {
        expect(html).toContain(`href="/services/${other.slug}"`);
      }
      // Do not introduce fabricated static prices into search pages/schema.
      expect(html).not.toMatch(/(?:startingPrice|offers|priceCurrency|priceSpecification)\\s*:/);
    }
  });

  test("keeps telephone and WhatsApp contact options separate", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: "تواصل مع طريق الشام" })).toBeVisible();
    const phone = page.getByRole("link", { name: "اتصال هاتفي" }).first();
    await expect(phone).toHaveAttribute("href", /^tel:\+963965350502$/);
    const whatsapp = page.getByRole("link", { name: "مراسلة دعم سوريا عبر واتساب" });
    await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/963965350502$/);
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
