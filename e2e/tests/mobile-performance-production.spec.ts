import { expect, test } from "@playwright/test";

async function criticalStylesheetText(page: import("@playwright/test").Page) {
  const urls = await page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
    links
      .map((link) => (link as HTMLLinkElement).href)
      .filter(Boolean),
  );

  const unique = [...new Set(urls)];
  const bodies = await Promise.all(
    unique.map(async (url) => {
      const response = await page.request.get(url);
      return response.ok() ? response.text() : "";
    }),
  );
  return bodies.join("\n");
}

test.describe("Production mobile performance boundaries", () => {
  test("runtime style assets are generated from installed packages", async ({ request }) => {
    const expected = [
      ["/vendor/react-datepicker.css", ".react-datepicker"],
      ["/vendor/react-phone-input.css", ".react-tel-input"],
      ["/vendor/leaflet.css", ".leaflet-container"],
      ["/vendor/booking-mobile.css", ".booking-map-modal"],
    ] as const;

    for (const [path, selector] of expected) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain(selector);
    }
  });

  test("login critical CSS excludes booking and map vendor styles", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();

    const css = await criticalStylesheetText(page);
    expect(css).not.toContain(".react-datepicker");
    expect(css).not.toContain(".react-tel-input");
    expect(css).not.toContain(".booking-map-modal");
    expect(css).not.toContain(".leaflet-container");
  });

  test("register loads phone input CSS only when that control is present", async ({ page }) => {
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".react-tel-input")).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/react-phone-input.css"]')).toHaveCount(1);
  });
});
