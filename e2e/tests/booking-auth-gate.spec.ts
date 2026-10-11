import { expect, test } from "@playwright/test";

test("booking page is accessible without a session", async ({ page }) => {
  await page.goto("/booking");
  await expect(page).toHaveURL(/\/booking$/);
  await expect(page.getByRole("heading", { name: "احجز سيارتك بخطوات واضحة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "التالي" })).toBeVisible();
});
