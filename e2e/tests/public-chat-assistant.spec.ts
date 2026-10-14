import { expect, test } from "@playwright/test";

test.describe("Public booking assistant", () => {
  test("visitor can ask questions without signing in when AI is unavailable", async ({ page }) => {
    await page.route("**/api/assistant/chat", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "AI_UNAVAILABLE" }) });
    });
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


  test("free-form Arabic questions use AI response without login", async ({ page }) => {
    let requestBody: unknown;
    await page.route("**/api/assistant/chat", async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ answer: "يمكنك مراجعة المسارات من صفحة خدماتنا.", source: "workers-ai" }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await dialog.getByRole("textbox", { name: "اكتب سؤالك" }).fill("هل ممكن تسافروني من دمشق للمطار؟");
    await dialog.getByRole("button", { name: "إرسال السؤال" }).click();

    await expect(dialog.getByText("يمكنك مراجعة المسارات من صفحة خدماتنا.")).toBeVisible();
    expect(requestBody).toMatchObject({ message: "هل ممكن تسافروني من دمشق للمطار؟" });
  });

  test("assistant is also available on booking page", async ({ page }) => {
    await page.goto("/booking");
    await expect(page.getByRole("button", { name: "فتح مساعد طريق الشام" })).toBeVisible();
  });
});
