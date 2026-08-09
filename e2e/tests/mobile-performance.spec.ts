import { expect, test } from "@playwright/test";

test.describe("Mobile performance boundaries", () => {
  test("home keeps booking code separate and CTA opens the dedicated booking page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /احجز رحلتك الآن/ })).toBeVisible();
    await expect(page.locator("#booking-card")).toHaveCount(0);
    await expect(page.locator('link[href="/vendor/react-datepicker.css"]')).toHaveCount(0);
    await expect(page.locator('link[href="/vendor/leaflet.css"]')).toHaveCount(0);
    await expect(page.locator('link[href="/vendor/booking-mobile.css"]')).toHaveCount(0);

    await page.getByRole("link", { name: /احجز رحلتك الآن/ }).click();
    await expect(page).toHaveURL(/\/booking$/);
    await expect(page.locator("#booking-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".route-choice-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('link[href="/vendor/react-datepicker.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/leaflet.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/booking-mobile.css"]')).toHaveCount(1);
  });
});
