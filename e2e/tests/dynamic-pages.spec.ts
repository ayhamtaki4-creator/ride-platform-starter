import { expect, Page, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

type DetailCase = {
  name: string;
  role: "admin" | "rider" | "driver";
  listPath: string;
  linkSelector: string;
};

const cases: DetailCase[] = [
  {
    name: "rider booking details",
    role: "rider",
    listPath: "/rider/bookings",
    linkSelector: 'a[href^="/rider/bookings/"]',
  },
  {
    name: "admin booking details",
    role: "admin",
    listPath: "/admin/bookings",
    linkSelector: 'a[href^="/admin/bookings/"]',
  },
  {
    name: "admin driver details",
    role: "admin",
    listPath: "/admin/drivers",
    linkSelector: 'a[href^="/admin/drivers/"]',
  },
  {
    name: "admin run details",
    role: "admin",
    listPath: "/admin/runs",
    linkSelector: 'a[href^="/admin/runs/"]',
  },
  {
    name: "driver run details",
    role: "driver",
    listPath: "/driver",
    linkSelector: 'a[href^="/driver/runs/"]',
  },
];

test.describe("Dynamic details pages", () => {
  for (const item of cases) {
    test(`${item.name} opens without 404`, async ({ page }) => {
      await loginAs(page, item.role);
      await page.goto(item.listPath);
      await waitForPageToSettle(page);

      const links = page.locator(item.linkSelector);
      const count = await links.count();

      test.skip(
        count === 0,
        `No matching data exists for ${item.name}.`,
      );

      const href = await links.first().getAttribute("href");
      expect(href).toBeTruthy();

      const response = await page.goto(href as string);

      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText(
        "This page could not be found",
      );
      await expect(page.locator("body")).not.toContainText(
        "404",
      );
    });
  }
});

async function waitForPageToSettle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(600);
}
