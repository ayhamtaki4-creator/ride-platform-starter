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
      pendingReviewOver30Minutes: number;
      confirmedWithoutDriverOver30Minutes: number;
    };
    for (const value of [
      dashboard.newBookings,
      dashboard.staleNewBookings,
      dashboard.confirmedWithoutDriver,
      dashboard.pendingReviewOver30Minutes,
      dashboard.confirmedWithoutDriverOver30Minutes,
    ]) {
      expect(Number.isInteger(value)).toBeTruthy();
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(dashboard.staleNewBookings).toBeLessThanOrEqual(dashboard.newBookings);
    expect(dashboard.staleNewBookings).toBeLessThanOrEqual(dashboard.pendingReviewOver30Minutes);
    expect(dashboard.pendingReviewOver30Minutes).toBeLessThanOrEqual(dashboard.newBookings);
    expect(dashboard.confirmedWithoutDriverOver30Minutes).toBeLessThanOrEqual(dashboard.confirmedWithoutDriver);
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
          pendingReviewOver30Minutes: 2,
          confirmedWithoutDriver: 1,
          confirmedWithoutDriverOver30Minutes: 1,
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

  test("priority queues match their dashboard criteria and exclude terminal reservations", async ({ request }) => {
    const token = await apiLogin(request, "admin");
    const now = Date.now();
    const filters = ["REVIEW_OVER_30M", "REVIEW_OVER_24H", "DRIVER_UNASSIGNED", "DRIVER_OVER_30M"] as const;
    for (const attention of filters) {
      const response = await request.get(`${apiBaseURL}/admin/bookings?attention=${attention}`, {
        headers: bearer(token),
      });
      expect(response.status(), await response.text()).toBe(200);
      const rows = await response.json() as Array<{
        id: string;
        status: string;
        bookingReviewStatus: string;
        requestedAt: string;
        confirmedAt?: string | null;
        driverId?: string | null;
        driver?: { id: string } | null;
      }>;
      expect(Array.isArray(rows)).toBe(true);
      const dates = rows.map((row) => new Date(row.requestedAt).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => a - b));
      for (const row of rows) {
        if (attention.startsWith("REVIEW")) {
          expect(row.bookingReviewStatus).toBe("NEW");
          expect(["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "NO_DRIVER_AVAILABLE", "PASSENGER_NO_SHOW", "DRIVER_NO_SHOW"]).not.toContain(row.status);
          expect(new Date(row.requestedAt).getTime()).toBeLessThan(now - (attention === "REVIEW_OVER_24H" ? 24 * 60 : 30) * 60_000);
        } else {
          expect(row.bookingReviewStatus).toBe("CONFIRMED");
          expect(["PENDING_DISPATCH", "SEARCHING_DRIVER"]).toContain(row.status);
          expect(row.driverId ?? row.driver ?? null).toBeNull();
          if (attention === "DRIVER_OVER_30M") {
            expect(new Date(row.confirmedAt ?? row.requestedAt).getTime()).toBeLessThan(now - 30 * 60_000);
          }
        }
      }
    }
    const invalid = await request.get(`${apiBaseURL}/admin/bookings?attention=NOT_A_REAL_QUEUE`, {
      headers: bearer(token),
    });
    expect(invalid.status()).toBe(400);
  });

  test("operator can open an exact priority queue from dashboard and clear the filter", async ({ page }) => {
    await page.route("**/api/admin/dashboard", (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:3000";
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({
          totalBookings: 20, newBookings: 8, pendingReviewOver30Minutes: 4,
          staleNewBookings: 2, confirmedWithoutDriver: 3,
          confirmedWithoutDriverOver30Minutes: 2,
          exhaustedTelegramDeliveries: 0, delayedTelegramDeliveries: 0,
          activeTrips: 0, availableDrivers: 0, revenue: 0,
          completedBookingValue: 0, outstandingRevenue: 0,
          unpaidCompletedBookings: 0, latest: [],
        }),
      });
    });
    await loginAs(page, "admin");
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "مراجعة الطلبات المتأخرة" })).toBeVisible();
    await page.getByRole("link", { name: "مراجعة الطلبات المتأخرة" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\?attention=REVIEW_OVER_30M/);
    await expect(page.getByRole("combobox", { name: "أولوية المتابعة" })).toHaveValue("REVIEW_OVER_30M");
    await expect(page.getByRole("status").filter({ hasText: "قائمة متابعة" })).toBeVisible();
    await page.getByRole("button", { name: "إزالة فلتر الأولوية" }).click();
    await expect(page.getByRole("combobox", { name: "أولوية المتابعة" })).toHaveValue("");
  });

});
