import { expect, test } from "@playwright/test";

async function stylesheetPaths(page: import("@playwright/test").Page) {
  return page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
    links
      .map((link) => new URL((link as HTMLLinkElement).href).pathname)
      .filter(Boolean),
  );
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

  test("login does not request booking or map vendor styles", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();

    const stylesheets = await stylesheetPaths(page);
    expect(stylesheets.filter((path) => path.startsWith("/vendor/"))).toEqual([]);
  });

  test("register loads phone input CSS only when that control is present", async ({ page }) => {
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".react-tel-input")).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/react-phone-input.css"]')).toHaveCount(1);

    const stylesheets = await stylesheetPaths(page);
    expect(stylesheets).toContain("/vendor/react-phone-input.css");
    expect(stylesheets).not.toContain("/vendor/react-datepicker.css");
    expect(stylesheets).not.toContain("/vendor/leaflet.css");
    expect(stylesheets).not.toContain("/vendor/booking-mobile.css");
  });
});
