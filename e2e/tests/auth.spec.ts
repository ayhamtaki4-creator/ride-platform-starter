import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Authentication and role routing", () => {
  test("public home page loads", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText(
      "This page could not be found",
    );
  });

  for (const role of ["admin", "rider", "driver"] as const) {
    test(`${role} account reaches its own dashboard`, async ({
      page,
    }) => {
      await loginAs(page, role);
      await expect(page.locator("body")).not.toContainText(
        "This page could not be found",
      );
    });
  }

  test("anonymous visitor is redirected from protected pages", async ({
    page,
  }) => {
    for (const route of ["/admin", "/rider", "/driver"]) {
      await page.goto(route);
      await page.waitForURL(
        (url) => url.pathname === "/login",
        { timeout: 15_000 },
      );
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("rider cannot remain on the admin dashboard", async ({
    page,
  }) => {
    await loginAs(page, "rider");
    await page.goto("/admin");
    await page.waitForURL(
      (url) => url.pathname === "/rider",
      { timeout: 15_000 },
    );
    await expect(page).toHaveURL(/\/rider$/);
  });
});
