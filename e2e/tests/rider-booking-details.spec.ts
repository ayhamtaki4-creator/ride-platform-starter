import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Rider booking details", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "rider");
    await page.goto("/rider/bookings");

    const links = page.locator(
      'a[href^="/rider/bookings/"]',
    );

    test.skip(
      (await links.count()) === 0,
      "The rider account has no bookings.",
    );

    const href = await links.first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href as string);
  });

  test("does not show the removed trip PIN", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText(
      /\bPIN\b|رمز بدء الرحلة|رمز التحقق/i,
    );
  });

  test("vehicle gallery is after order details and before booking stages", async ({
    page,
  }) => {
    const detailsHeading = page
      .getByRole("heading", {
        name: /تفاصيل (الحجز|الطلب)/,
      })
      .first();

    const stagesHeading = page
      .getByRole("heading", {
        name: /مراحل (الحجز|الرحلة)/,
      })
      .first();

    const gallery = page
      .locator('section[aria-label="صور المركبة"]')
      .first();

    await expect(detailsHeading).toBeVisible();
    await expect(gallery).toBeVisible();
    await expect(stagesHeading).toBeVisible();

    const correctOrder = await detailsHeading.evaluate(
      (heading) => {
        const details = heading.closest("section");
        const galleryElement = document.querySelector(
          'section[aria-label="صور المركبة"]',
        );
        const stageHeading = Array.from(
          document.querySelectorAll("h1, h2, h3"),
        ).find((element) =>
          /مراحل (الحجز|الرحلة)/.test(
            element.textContent ?? "",
          ),
        );
        const stages = stageHeading?.closest("section");

        if (!details || !galleryElement || !stages) {
          return false;
        }

        const following = Node.DOCUMENT_POSITION_FOLLOWING;

        return (
          Boolean(
            details.compareDocumentPosition(galleryElement) &
              following,
          ) &&
          Boolean(
            galleryElement.compareDocumentPosition(stages) &
              following,
          )
        );
      },
    );

    expect(correctOrder).toBeTruthy();
  });

  test("all displayed vehicle images load successfully", async ({
    page,
  }) => {
    const gallery = page
      .locator('section[aria-label="صور المركبة"]')
      .first();

    await expect(gallery).toBeVisible();

    const images = gallery.locator("img");
    const count = await images.count();

    if (count === 0) {
      await expect(gallery).toContainText(
        /لم تتم إضافة صور|تعذر تحميل الصور/,
      );
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const image = images.nth(index);

      await expect
        .poll(
          async () =>
            image.evaluate(
              (element) =>
                element.complete &&
                element.naturalWidth > 0 &&
                element.naturalHeight > 0,
            ),
          {
            message: `Vehicle image ${index + 1} did not load.`,
          },
        )
        .toBeTruthy();
    }
  });
});
