import { expect, test } from "@playwright/test";

test.describe("Mobile API network resilience", () => {
  test("retries one transient GET failure and then recovers", async ({ page }) => {
    let routeCalls = 0;

    await page.route("**/api/routes", async (route) => {
      routeCalls += 1;
      if (routeCalls === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "Retry-After": "0" },
          body: JSON.stringify({ message: "temporary upstream outage" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/booking");

    await expect.poll(() => routeCalls, { timeout: 10_000 }).toBe(2);
    await expect(page.locator("#booking-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".route-choice-card").first()).toBeVisible({ timeout: 15_000 });
  });

  test("retries one browser network failure for a safe GET", async ({ page }) => {
    let routeCalls = 0;

    await page.route("**/api/routes", async (route) => {
      routeCalls += 1;
      if (routeCalls === 1) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/booking");

    await expect.poll(() => routeCalls, { timeout: 10_000 }).toBe(2);
    await expect(page.locator("#booking-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".route-choice-card").first()).toBeVisible({ timeout: 15_000 });
  });

  test("does not automatically retry a failed login POST", async ({ page }) => {
    let loginCalls = 0;

    await page.route("**/api/auth/login", async (route) => {
      loginCalls += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "الخدمة غير متاحة مؤقتًا." }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill("rider@example.com");
    await page.locator('input[type="password"]').fill("not-used-by-the-stub");
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();

    // The same error may be rendered in more than one accessible surface
    // (for example inline + toast). We only need to assert that the failure is
    // surfaced while independently verifying that the POST happened once.
    await expect(page.getByText("الخدمة غير متاحة مؤقتًا.").first()).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(loginCalls).toBe(1);
  });

  test("shows immediate offline feedback and confirms reconnection", async ({ page, context }) => {
    await page.goto("/login");
    await expect(page.locator('[data-connection-state="offline"]')).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.locator('[data-connection-state="offline"]')).toBeVisible();
    await expect(page.getByText(/لا يوجد اتصال بالإنترنت/)).toBeVisible();

    await context.setOffline(false);
    await expect(page.locator('[data-connection-state="restored"]')).toBeVisible();
    await expect(page.getByText("عاد الاتصال بالإنترنت.")).toBeVisible();
  });
});
