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
      waitingReviewOverTwoHours: number;
      attentionQueue: Array<{ id: string; category: string; ageMinutes: number; requestedAt: string; bookingReference: string | null; route: { nameAr: string } | null }>;
    };
    for (const value of [
      dashboard.newBookings,
      dashboard.staleNewBookings,
      dashboard.confirmedWithoutDriver,
      dashboard.waitingReviewOverTwoHours,
    ]) {
      expect(Number.isInteger(value)).toBeTruthy();
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(dashboard.staleNewBookings).toBeLessThanOrEqual(dashboard.newBookings);
    expect(dashboard.waitingReviewOverTwoHours).toBeGreaterThanOrEqual(dashboard.staleNewBookings);
    expect(dashboard.attentionQueue.length).toBeLessThanOrEqual(16);
    for (const item of dashboard.attentionQueue) {
      expect(["NEEDS_REVIEW", "NEEDS_DRIVER"]).toContain(item.category);
      expect(item.id).toBeTruthy();
      expect(Number.isInteger(item.ageMinutes)).toBe(true);
      expect(item.ageMinutes).toBeGreaterThanOrEqual(0);
      expect(item).not.toHaveProperty("contactPhone");
      expect(item).not.toHaveProperty("contactName");
      expect(item).not.toHaveProperty("passenger");
    }
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
          waitingReviewOverTwoHours: 2,
          confirmedWithoutDriver: 1,
          attentionQueue: [
            { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", bookingReference: "TS-OLD-001", requestedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), ageMinutes: 1560, travelDate: null, category: "NEEDS_REVIEW", route: { nameAr: "دمشق إلى مطار بيروت" } },
            { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bookingReference: "TS-DRV-002", requestedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), ageMinutes: 30, travelDate: null, category: "NEEDS_DRIVER", route: { nameAr: "دمشق إلى مطار الملكة علياء" } },
          ],
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
    await expect(page.getByText("أولويات مركز العمليات")).toBeVisible();
    await expect(page.getByText("مراجعة متأخرة")).toBeVisible();
    await expect(page.getByText("بحاجة إلى سائق")).toBeVisible();
    await expect(page.getByText(/ينتظر المراجعة منذ أكثر من ساعتين/)).toBeVisible();
    await expect(page.getByRole("link", { name: "مراجعة الحجز" })).toHaveAttribute("href", "/admin/bookings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await expect(page.getByRole("link", { name: "تعيين سائق" })).toHaveAttribute("href", "/admin/bookings/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await page.getByRole("link", { name: "مراجعة الطلبات الجديدة" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\?status=NEW/);
    await expect(page.locator("section.filters select")).toHaveValue("NEW");
  });
});
