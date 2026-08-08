import { expect, test } from "@playwright/test";

test.describe("iPhone public shell", () => {
  test("home navigation fits the viewport and remains usable", async ({ page }) => {
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: "فتح قائمة الموقع" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const navigation = page.getByRole("navigation", { name: "قائمة الموقع للهاتف" });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link", { name: "احجز رحلتك" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("login fields avoid Safari auto-zoom", async ({ page }) => {
    await page.goto("/login");

    const inputs = page.locator('input[type="email"], input[type="password"]');
    await expect(inputs).toHaveCount(2);

    for (let index = 0; index < 2; index += 1) {
      const fontSize = await inputs.nth(index).evaluate((element) =>
        Number.parseFloat(window.getComputedStyle(element).fontSize),
      );
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
  });
});
