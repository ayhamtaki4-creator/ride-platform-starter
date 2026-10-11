import { expect, test } from "@playwright/test";

test.describe("Mobile performance boundaries", () => {
  test("home keeps booking code separate and CTA opens public booking without registering", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /احجز رحلتك الآن/ })).toBeVisible();
    await expect(page.locator("#booking-card")).toHaveCount(0);
    await expect(page.locator('link[href="/vendor/react-datepicker.css"]')).toHaveCount(0);
    await expect(page.locator('link[href="/vendor/leaflet.css"]')).toHaveCount(0);
    await expect(page.locator('link[href="/vendor/booking-mobile.css"]')).toHaveCount(0);

    await page.getByRole("link", { name: /احجز رحلتك الآن/ }).click();
    await expect(page).toHaveURL(/\/booking$/);
    await expect(page.getByRole("heading", { name: "احجز سيارتك بخطوات واضحة" })).toBeVisible();
    await expect(page.locator("#booking-card")).toBeVisible();
  });
});
