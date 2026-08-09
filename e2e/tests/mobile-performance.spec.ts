import { expect, test } from "@playwright/test";

async function loadedStylesheetText(page: import("@playwright/test").Page) {
  const urls = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry as PerformanceResourceTiming)
      .filter(
        (entry) =>
          entry.initiatorType === "link" ||
          new URL(entry.name).pathname.endsWith(".css"),
      )
      .map((entry) => entry.name),
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

test.describe("Mobile performance boundaries", () => {
  test("login route does not load booking-only vendor CSS", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const css = await loadedStylesheetText(page);
    expect(css).not.toContain(".react-datepicker");
    expect(css).not.toContain(".react-tel-input");
    expect(css).not.toContain(".booking-map-modal");
  });

  test("booking form activates immediately when the user chooses the booking CTA", async ({ page }) => {
    await page.goto("/");

    const boundary = page.locator("[data-booking-lazy-state]");
    await expect(boundary).toHaveCount(1);

    await page.getByRole("link", { name: /احجز رحلتك الآن/ }).click();
    await expect(page).toHaveURL(/#booking$/);
    await expect(boundary).toHaveAttribute("data-booking-lazy-state", "active");
    await expect(page.getByText("اختر مسار الرحلة")).toBeVisible({ timeout: 15_000 });
  });
});
