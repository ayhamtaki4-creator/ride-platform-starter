import { devices, expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.use({ ...devices["Pixel 7"] });

test.describe("Mobile shell", () => {
  test("public mobile menu is usable without horizontal overflow", async ({ page }) => {
    await page.goto("/");

    const openMenuButton = page.getByRole("button", { name: "فتح قائمة الموقع" });
    await expect(openMenuButton).toBeVisible();
    await expect(openMenuButton).toHaveAttribute("aria-expanded", "false");

    await openMenuButton.click();

    const navigation = page.getByRole("navigation", { name: "قائمة الموقع للهاتف" });
    const closeMenuButton = page.getByRole("button", { name: "إغلاق قائمة الموقع" });
    await expect(navigation).toBeVisible();
    await expect(closeMenuButton).toBeVisible();
    await expect(closeMenuButton).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("link", { name: "احجز رحلتك" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "كيف تعمل المنصة" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "خدماتنا" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "الأسئلة الشائعة" })).toBeVisible();

    expect(await hasHorizontalOverflow(page)).toBe(false);

    await closeMenuButton.click();
    await expect(navigation).toHaveCount(0);
    await expect(page.getByRole("button", { name: "فتح قائمة الموقع" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("login inputs keep an iOS-safe font size", async ({ page }) => {
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

  for (const role of ["rider", "driver"] as const) {
    test(`${role} gets a fixed four-item bottom navigation`, async ({ page }) => {
      await loginAs(page, role);

      const navigation = page.getByRole("navigation", { name: "التنقل السريع للهاتف" });
      await expect(navigation).toBeVisible();

      const links = navigation.getByRole("link");
      await expect(links).toHaveCount(4);

      for (let index = 0; index < 4; index += 1) {
        const box = await links.nth(index).boundingBox();
        expect(box, `mobile nav link ${index + 1} has no layout box`).not.toBeNull();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      const navBox = await navigation.boundingBox();
      expect(navBox).not.toBeNull();
      expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual(
        (page.viewportSize()?.height ?? 0) + 1,
      );

      const expectedHome = role === "rider" ? "/rider" : "/driver";
      await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute(
        "href",
        expectedHome,
      );

      const destinationLabel = role === "rider" ? "حجوزاتي" : "المهام";
      const destinationPath = role === "rider" ? "/rider/bookings" : "/driver/bookings";
      await navigation.getByRole("link", { name: destinationLabel }).click();
      await page.waitForURL((url) => url.pathname === destinationPath, { timeout: 15_000 });
      await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute(
        "href",
        destinationPath,
      );

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }

  test("admin keeps the drawer navigation instead of the passenger bottom bar", async ({ page }) => {
    await loginAs(page, "admin");

    await expect(
      page.getByRole("navigation", { name: "التنقل السريع للهاتف" }),
    ).toHaveCount(0);

    const menuButton = page.getByRole("button", { name: "فتح القائمة" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.locator(".app-sidebar")).toHaveClass(/is-open/);
    await expect(
      page.getByRole("navigation", { name: "قائمة لوحة التحكم" }),
    ).toBeVisible();

    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});

async function hasHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
}
