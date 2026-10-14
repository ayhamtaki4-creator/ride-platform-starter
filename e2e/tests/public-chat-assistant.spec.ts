import { expect, test } from "@playwright/test";

test.describe("Public booking assistant", () => {
  test("visitor can ask questions without signing in", async ({ page }) => {
    await page.goto("/");

    const launcher = page.getByRole("button", { name: "فتح مساعد طريق الشام" });
    await expect(launcher).toBeVisible();
    await launcher.click();

    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "كم سعر الرحلة؟" }).click();
    await expect(dialog.getByText(/يختلف السعر حسب المسار/)).toBeVisible();
    await expect(dialog.getByRole("link", { name: /عرض الأسعار في الحجز/ })).toHaveAttribute("href", "/booking");

    await dialog.getByRole("textbox", { name: "اكتب سؤالك" }).fill("كيف أتابع حجزي؟");
    await dialog.getByRole("button", { name: "إرسال السؤال" }).click();
    await expect(dialog.getByText(/إذا حجزت كضيف/)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("assistant is also available on booking page", async ({ page }) => {
    await page.goto("/booking");
    await expect(page.getByRole("button", { name: "فتح مساعد طريق الشام" })).toBeVisible();
  });
});
