import { expect, test } from "@playwright/test";

test.describe("Mobile performance boundaries", () => {
  test("booking form activates immediately when the user chooses the booking CTA", async ({ page }) => {
    await page.goto("/");

    const boundary = page.locator("[data-booking-lazy-state]");
    await expect(boundary).toHaveCount(1);

    await page.getByRole("link", { name: /احجز رحلتك الآن/ }).click();
    await expect(page).toHaveURL(/#booking$/);
    await expect(boundary).toHaveAttribute("data-booking-lazy-state", "active");
    await expect(page.getByText("اختر مسار الرحلة")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('link[href="/vendor/react-datepicker.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/leaflet.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="/vendor/booking-mobile.css"]')).toHaveCount(1);
  });
});
