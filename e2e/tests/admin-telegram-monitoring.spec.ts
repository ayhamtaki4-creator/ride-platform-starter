import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer, loginAs } from "../helpers/auth";

test.describe("Operations monitoring", () => {
  test("admin dashboard exposes safe Telegram delivery counts", async ({ request }) => {
    const token = await apiLogin(request, "admin");
    const response = await request.get(`${apiBaseURL}/admin/dashboard`, {
      headers: bearer(token),
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      exhaustedTelegramDeliveries: number;
      delayedTelegramDeliveries: number;
    };
    for (const value of [body.exhaustedTelegramDeliveries, body.delayedTelegramDeliveries]) {
      expect(Number.isInteger(value)).toBeTruthy();
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  test("admin can review Telegram status and deliveries without sending messages", async ({ request }) => {
    const token = await apiLogin(request, "admin");
    const config = await request.get(`${apiBaseURL}/admin/telegram/status`, {
      headers: bearer(token),
    });
    expect(config.status()).toBe(200);
    const details = (await config.json()) as {
      enabled: boolean;
      configured: boolean;
    };
    expect(typeof details.enabled).toBe("boolean");
    expect(typeof details.configured).toBe("boolean");

    const list = await request.get(`${apiBaseURL}/admin/telegram/deliveries?status=FAILED`, {
      headers: bearer(token),
    });
    expect(list.status()).toBe(200);
    const rows = (await list.json()) as Array<{ status: string; attempts: number }>;
    expect(Array.isArray(rows)).toBeTruthy();
    expect(rows.every((row) => row.status === "FAILED")).toBeTruthy();
  });

  test("admin sees Telegram monitoring page and can filter delivery history", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/telegram?status=FAILED");
    await expect(page.getByRole("heading", { name: "مراقبة إشعارات Telegram" })).toBeVisible();
    await expect(page.locator("#telegram-delivery-filter")).toHaveValue("FAILED");
    await expect(page.getByRole("button", { name: "تحديث" })).toBeVisible();
    await expect(page.locator("table.data-table thead")).toContainText("المحاولات");
  });
});
