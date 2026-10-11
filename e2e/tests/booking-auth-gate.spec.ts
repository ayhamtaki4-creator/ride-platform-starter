import { expect, test } from "@playwright/test";

test("booking page is accessible without a session", async ({ page }) => {
  await page.goto("/booking");
  await expect(page).toHaveURL(/\/booking$/);
  await expect(page.getByRole("heading", { name: "احجز سيارتك بخطوات واضحة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "التالي" })).toBeVisible();
});

test("guest confirmation encourages sign-in or registration without phone activation", async ({ page }) => {
  await page.goto("/booking/success?ref=GUEST-TEST");
  await expect(page.getByRole("heading", { name: "تم استلام طلب الحجز" })).toBeVisible();
  await expect(page.getByText("إذا أردت الاستفادة من باقي مزايا الموقع، يرجى تسجيل الدخول أو إنشاء حساب.")).toBeVisible();
  await expect(page.getByRole("link", { name: "تسجيل الدخول" }).first()).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "إنشاء حساب جديد" })).toHaveAttribute("href", "/register");
  await expect(page.getByRole("link", { name: "التحقق من الهاتف وتفعيل الحساب" })).toHaveCount(0);
});

test("old activation link now shows signup options instead of OTP form", async ({ page }) => {
  await page.goto("/activate");
  await expect(page.getByRole("heading", { name: "استفد من مزايا طريق الشام" })).toBeVisible();
  await expect(page.getByRole("link", { name: "إنشاء حساب جديد" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إرسال رمز التحقق" })).toHaveCount(0);
});
