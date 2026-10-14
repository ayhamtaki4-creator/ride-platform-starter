import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer, loginAs } from "../helpers/auth";

test.describe("Admin booking operations alerts", () => {
  test("dashboard exposes nonnegative actionable alert counts", async ({ request }) => {
    const token = await apiLogin(request, "admin");
    const response = await request.get(`${apiBaseURL}/admin/dashboard`, {
      headers: bearer(token),
    });
    expect(response.ok(), await response.text()).toBeTruthy();

    const dashboard = (await response.json()) as {
      newBookings: number;
      staleNewBookings: number;
      confirmedWithoutDriver: number;
    };
    for (const value of [
      dashboard.newBookings,
      dashboard.staleNewBookings,
      dashboard.confirmedWithoutDriver,
    ]) {
      expect(Number.isInteger(value)).toBeTruthy();
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(dashboard.staleNewBookings).toBeLessThanOrEqual(dashboard.newBookings);
  });

  test("alert links open the appropriate booking filter", async ({ page }) => {
    await page.route("**/api/admin/dashboard", (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:3000";
      const cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      };
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: cors });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({
          totalBookings: 3,
          newBookings: 2,
          staleNewBookings: 2,
          confirmedWithoutDriver: 1,
          activeTrips: 0,
          availableDrivers: 1,
          revenue: 0,
          completedBookingValue: 0,
          outstandingRevenue: 0,
          unpaidCompletedBookings: 0,
          latest: [],
        }),
      });
    });
    await loginAs(page, "admin");
    await page.goto("/admin");
    await expect(page.getByText("حجوزات تحتاج متابعة")).toBeVisible();
    await page.getByRole("link", { name: "مراجعة الطلبات الجديدة" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\?status=NEW/);
    await expect(page.locator("section.filters select")).toHaveValue("NEW");
  });
});
