import { devices, expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.use({ ...devices["Pixel 7"] });

test.describe("Mobile shell", () => {
  test("public mobile menu is usable without horizontal overflow", async ({ page }) => {
    await page.goto("/");

    const openMenuButton = page.getByRole("button", { name: "فتح قائمة الموقع" });
    await expect(openMenuButton).toBeVisible();
    await expect(openMenuButton).toHaveAttribute("aria-expanded", "false");

    await openMenuButton.click();

    const navigation = page.getByRole("navigation", { name: "قائمة الموقع للهاتف" });
    const closeMenuButton = page.getByRole("button", { name: "إغلاق قائمة الموقع" });
    await expect(navigation).toBeVisible();
    await expect(closeMenuButton).toBeVisible();
    await expect(closeMenuButton).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("link", { name: "احجز رحلتك" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "كيف تعمل المنصة" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "خدماتنا" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "الأسئلة الشائعة" })).toBeVisible();

    expect(await hasHorizontalOverflow(page)).toBe(false);

    await closeMenuButton.click();
    await expect(navigation).toHaveCount(0);
    await expect(page.getByRole("button", { name: "فتح قائمة الموقع" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("login inputs keep an iOS-safe font size", async ({ page }) => {
    await page.goto("/login");

    const inputs = page.locator('input[type="email"], input[type="password"]');
    await expect(inputs).toHaveCount(2);

    for (let index = 0; index < 2; index += 1) {
      const fontSize = await inputs.nth(index).evaluate((element) =>
        Number.parseFloat(window.getComputedStyle(element).fontSize),
      );
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
  });

  for (const role of ["rider", "driver"] as const) {
    test(`${role} gets a fixed four-item bottom navigation`, async ({ page }) => {
      await loginAs(page, role);

      const navigation = page.getByRole("navigation", { name: "التنقل السريع للهاتف" });
      await expect(navigation).toBeVisible();

      const links = navigation.getByRole("link");
      await expect(links).toHaveCount(4);

      for (let index = 0; index < 4; index += 1) {
        const box = await links.nth(index).boundingBox();
        expect(box, `mobile nav link ${index + 1} has no layout box`).not.toBeNull();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      const navBox = await navigation.boundingBox();
      expect(navBox).not.toBeNull();
      expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual(
        (page.viewportSize()?.height ?? 0) + 1,
      );

      const expectedHome = role === "rider" ? "/rider" : "/driver";
      await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute(
        "href",
        expectedHome,
      );

      const destinationLabel = role === "rider" ? "حجوزاتي" : "المهام";
      const destinationPath = role === "rider" ? "/rider/bookings" : "/driver/bookings";
      await navigation.getByRole("link", { name: destinationLabel }).click();
      await page.waitForURL((url) => url.pathname === destinationPath, { timeout: 15_000 });
      await expect(navigation.locator('a[aria-current="page"]')).toHaveAttribute(
        "href",
        destinationPath,
      );

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }

  test("driver tracking page shows GPS, network, and server health cards", async ({ page }) => {
    await loginAs(page, "driver");
    await page.goto("/driver/bookings");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(600);

    const trackingLinks = page.locator('a[href^="/driver/bookings/"][href$="/tracking"]');
    const count = await trackingLinks.count();
    test.skip(count === 0, "No active driver tracking task exists in the E2E seed.");

    const href = await trackingLinks.first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href as string);

    const statusGrid = page.locator(".driver-tracking-status-grid");
    await expect(statusGrid).toBeVisible();
    await expect(statusGrid.getByText("GPS", { exact: true })).toBeVisible();
    await expect(statusGrid.getByText("الإنترنت", { exact: true })).toBeVisible();
    await expect(statusGrid.getByText("الخادم", { exact: true })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("driver must answer whether cash was received after completing a trip", async ({ page }) => {
    await loginAs(page, "driver");

    const trip = {
      id: "11111111-1111-4111-8111-111111111111",
      passengerId: "22222222-2222-4222-8222-222222222222",
      driverId: "33333333-3333-4333-8333-333333333333",
      status: "IN_PROGRESS",
      bookingReviewStatus: "CONFIRMED",
      driverAssignmentStatus: "ACCEPTED",
      bookingReference: "PAY-UI-E2E",
      bookingType: "PRIVATE_CAR",
      vehicleClass: "SMALL",
      travelDate: new Date(Date.now() + 86_400_000).toISOString(),
      passengerCount: 1,
      luggageCount: 1,
      contactName: "مسافر اختبار",
      contactPhone: "+963944000001",
      pickupAddress: "دمشق",
      pickupLatitude: 33.5138,
      pickupLongitude: 36.2765,
      dropoffAddress: "مطار بيروت",
      dropoffLatitude: 33.8209,
      dropoffLongitude: 35.4884,
      estimatedFare: 100,
      finalFare: null,
      currency: "USD",
      requestedAt: new Date().toISOString(),
      passenger: { firstName: "مسافر", lastName: "اختبار", phone: "+963944000001" },
    };

    await page.route(/\/api\/drivers\/me$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "driver-profile", status: "APPROVED", availability: "ON_TRIP", rating: 5, vehicles: [] }),
    }));
    await page.route(/\/api\/drivers\/me\/schedule$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([trip]),
    }));
    await page.route(/\/api\/drivers\/me\/runs$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    }));

    let completeRequests = 0;
    let cashRequests = 0;
    await page.route(new RegExp(`/api/trips/${trip.id}/complete$`), (route) => {
      completeRequests += 1;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ...trip, status: "COMPLETED", finalFare: 100 }),
      });
    });
    await page.route(new RegExp(`/api/drivers/me/bookings/${trip.id}/cash-payment$`), (route) => {
      cashRequests += 1;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ paymentStatus: "PAID", amountReceived: 100 }),
      });
    });

    await page.goto("/driver/bookings");
    await expect(page.getByRole("button", { name: "إنهاء الرحلة" })).toBeVisible();
    await page.getByRole("button", { name: "إنهاء الرحلة" }).click();

    const dialog = page.getByTestId("driver-cash-payment-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "هل استلمت المبلغ من المسافر؟" })).toBeVisible();
    await expect(page.getByTestId("driver-cash-received-yes")).toBeVisible();
    await expect(page.getByTestId("driver-cash-received-no")).toBeVisible();

    await page.getByTestId("driver-cash-received-no").click();
    await expect(dialog).toHaveCount(0);
    expect(cashRequests).toBe(0);
    expect(completeRequests).toBe(1);

    await page.getByRole("button", { name: "إنهاء الرحلة" }).click();
    await expect(page.getByTestId("driver-cash-payment-dialog")).toBeVisible();
    await page.getByTestId("driver-cash-received-yes").click();
    await expect(page.getByTestId("driver-cash-payment-dialog")).toHaveCount(0);
    expect(cashRequests).toBe(1);
    expect(completeRequests).toBe(2);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("admin keeps drawer navigation and GPS monitoring separate from bookings", async ({ page }) => {
    await loginAs(page, "admin");

    await expect(
      page.getByRole("navigation", { name: "التنقل السريع للهاتف" }),
    ).toHaveCount(0);

    const menuButton = page.getByRole("button", { name: "فتح القائمة" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.locator(".app-sidebar")).toHaveClass(/is-open/);
    const adminNavigation = page.getByRole("navigation", { name: "قائمة لوحة التحكم" });
    await expect(adminNavigation).toBeVisible();
    await expect(adminNavigation.getByRole("link", { name: "مراقبة GPS" })).toBeVisible();

    await page.goto("/admin/bookings");
    await expect(page.locator('section[aria-label="مراقبة GPS للسائقين"]')).toHaveCount(0);
    const trackingLink = page.getByRole("link", { name: "مراقبة GPS للسائقين" });
    await expect(trackingLink).toBeVisible();
    await trackingLink.click();
    await page.waitForURL((url) => url.pathname === "/admin/tracking", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "مراقبة GPS للسائقين" })).toBeVisible();
    await expect(page.locator('section[aria-label="مراقبة GPS للسائقين"]')).toBeVisible();

    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});

async function hasHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
}
