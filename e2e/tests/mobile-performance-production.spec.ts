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
  test("login critical CSS excludes booking-only vendor styles", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();

    const css = await criticalStylesheetText(page);
    expect(css).not.toContain(".react-datepicker");
    expect(css).not.toContain(".react-tel-input");
    expect(css).not.toContain(".booking-map-modal");
  });
});
