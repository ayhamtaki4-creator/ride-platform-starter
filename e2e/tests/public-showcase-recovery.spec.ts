import { expect, test } from "@playwright/test";

test.describe("Public homepage vehicle gallery", () => {
  test("a guest sees a recoverable error and can retry without signing in", async ({ page }) => {
    let temporaryFailure = true;

    await page.route("**/api/health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ status: "ok" }),
      }),
    );
    await page.route("**/api/home/showcase", (route) =>
      route.fulfill(
        temporaryFailure
          ? {
              status: 503,
              contentType: "application/json",
              headers: { "access-control-allow-origin": "*" },
              body: JSON.stringify({ message: "Temporarily unavailable" }),
            }
          : {
              status: 200,
              contentType: "application/json",
              headers: { "access-control-allow-origin": "*" },
              body: JSON.stringify([
                {
                  id: "gallery-test-vehicle",
                  titleAr: "سيارة اختبار",
                  subtitleAr: "صورة عامة دون تسجيل دخول",
                  imageUrl: "https://gallery-test.invalid/unavailable.jpg",
                },
              ]),
            },
      ),
    );
    await page.route("https://gallery-test.invalid/**", (route) => route.abort());

    await page.goto("/");
    await expect(
      page.getByText("تعذر تحميل صور السيارات حاليًا. لا تحتاج إلى تسجيل الدخول لعرضها."),
    ).toBeVisible();

    temporaryFailure = false;
    await page.getByRole("button", { name: "إعادة المحاولة" }).click();
    await expect(page.getByText("سيارة اختبار")).toBeVisible();
    await expect(page.getByText("صورة عامة دون تسجيل دخول")).toBeVisible();

    await page.getByText("سيارة اختبار").scrollIntoViewIfNeeded();
    await expect(page.getByText("صورة السيارة غير متاحة مؤقتًا")).toBeVisible();
  });
});
