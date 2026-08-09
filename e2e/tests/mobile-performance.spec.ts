import { expect, test } from "@playwright/test";

test.describe("Mobile performance boundaries", () => {
  test("booking routes load immediately with the home page", async ({ page }) => {
    await page.goto("/");

    const boundary = page.locator("[data-booking-load-state]");
    await expect(boundary).toHaveCount(1);
    await expect(boundary).toHaveAttribute("data-booking-load-state", "active");
    await expect(page.getByText("اختر خط الرحلة")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".route-choice-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('link[href="/vendor/react-datepicker.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/leaflet.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/booking-mobile.css"]')).toHaveCount(1);

    await page.getByRole("link", { name: /احجز رحلتك الآن/ }).click();
    await expect(page).toHaveURL(/#booking$/);
  });
});
