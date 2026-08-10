import { expect, test } from "@playwright/test";
import { accounts } from "../helpers/accounts";

test.describe("Booking authentication gate", () => {
  test("redirects anonymous visitors to registration and returns existing riders to booking after login", async ({ page }) => {
    await page.goto("/booking");

    await expect(page).toHaveURL(/\/register\?next=%2Fbooking$/);
    await expect(page.getByRole("heading", { name: "إنشاء حساب مسافر" })).toBeVisible();
    await expect(page.getByText("أنشئ حسابك أولًا، وبعدها سننقلك مباشرة إلى صفحة الحجز.")).toBeVisible();

    const loginLink = page.getByRole("main").getByRole("link", { name: "تسجيل الدخول" });
    await expect(loginLink).toHaveAttribute("href", "/login?next=%2Fbooking");
    await loginLink.click();

    await expect(page).toHaveURL(/\/login\?next=%2Fbooking$/);
    await page.getByLabel("البريد الإلكتروني").fill(accounts.rider.email);
    await page.locator('input[type="password"]').fill(accounts.rider.password);
    await page.getByRole("button", { name: /تسجيل الدخول/ }).click();

    await expect(page).toHaveURL(/\/booking$/);
    await expect(page.getByRole("heading", { name: "احجز سيارتك بخطوات واضحة" })).toBeVisible();
  });
});
