import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Rider booking details", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "rider");
    await page.goto("/rider/bookings");

    const links = page.locator('a[href^="/rider/bookings/"]');
    test.skip((await links.count()) === 0, "The rider account has no bookings.");

    const href = await links.first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href as string);
  });

  test("does not show the removed trip PIN", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText(/\bPIN\b|رمز بدء الرحلة|رمز التحقق/i);
  });

  test("shows driver, vehicle photos, live map, then remaining booking information", async ({ page }) => {
    const driver = page.locator('section[aria-label="السائق والمركبة"]').first();
    const gallery = page.locator('section[aria-label="صور المركبة"]').first();
    const map = page.locator('section[aria-label="الخريطة والموقع المباشر"]').first();
    const infoHeading = page.getByRole("heading", { name: "معلومات الحجز" }).first();

    await expect(driver).toBeVisible();
    await expect(gallery).toBeVisible();
    await expect(map).toBeVisible();
    await expect(infoHeading).toBeVisible();
    await expect(map.getByRole("button", { name: /مشاركة الموقع المباشر/ })).toBeVisible();

    const correctOrder = await driver.evaluate((driverElement) => {
      const galleryElement = document.querySelector('section[aria-label="صور المركبة"]');
      const mapElement = document.querySelector('section[aria-label="الخريطة والموقع المباشر"]');
      const infoHeadingElement = Array.from(document.querySelectorAll("h1, h2, h3")).find(
        (element) => element.textContent?.trim() === "معلومات الحجز",
      );
      const infoElement = infoHeadingElement?.closest("section");
      if (!galleryElement || !mapElement || !infoElement) return false;
      const following = Node.DOCUMENT_POSITION_FOLLOWING;
      return (
        Boolean(driverElement.compareDocumentPosition(galleryElement) & following) &&
        Boolean(galleryElement.compareDocumentPosition(mapElement) & following) &&
        Boolean(mapElement.compareDocumentPosition(infoElement) & following)
      );
    });

    expect(correctOrder).toBeTruthy();
  });

  test("all displayed vehicle images load successfully", async ({ page }) => {
    const gallery = page.locator('section[aria-label="صور المركبة"]').first();
    await expect(gallery).toBeVisible();

    const images = gallery.locator("img");
    const count = await images.count();
    if (count === 0) {
      await expect(gallery).toContainText(/لم تتم إضافة صور|تعذر تحميل الصور/);
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const image = images.nth(index);
      await expect.poll(
        async () => image.evaluate((element) => element.complete && element.naturalWidth > 0 && element.naturalHeight > 0),
        { message: `Vehicle image ${index + 1} did not load.` },
      ).toBeTruthy();
    }
  });
});
