import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

type RouteRow = {
  id: string;
  bookable: boolean;
  requiresFlightDetails: boolean;
  bookingTypes: string[];
  pricingRules: Array<{ bookingType: string; vehicleClass: string; isActive?: boolean }>;
};

test("booking steps block incomplete passenger phone with Arabic inline explanation", async ({ page, request }) => {
  const apiRoutes = await request.get(`${apiBaseURL}/routes`);
  expect(apiRoutes.ok(), await apiRoutes.text()).toBeTruthy();
  const routes = (await apiRoutes.json()) as RouteRow[];
  const route = routes.find((entry) =>
    entry.bookable &&
    entry.bookingTypes.includes("PRIVATE_CAR") &&
    entry.pricingRules.some((rule) =>
      rule.bookingType === "PRIVATE_CAR" && rule.vehicleClass === "SMALL" && rule.isActive !== false,
    ),
  );
  expect(route, "a seeded, bookable small-car route is required").toBeTruthy();

  // Use a valid live route with optional flight fields to exercise passenger
  // validation, without creating a real reservation.
  await page.route("**/api/routes", async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ ...route, requiresFlightDetails: false }]),
    });
  });

  await page.goto("/booking");
  await expect(page.locator(".route-choice-card").first()).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("heading", { name: "اختر موعد الرحلة وحجم السيارة" })).toBeVisible();

  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("heading", { name: "بيانات المسافر والعناوين" })).toBeVisible();

  await page.locator('input[name="passengerPhone"]').fill("+963");
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("heading", { name: "بيانات المسافر والعناوين" })).toBeVisible();
  await expect(page.getByText("أدخل اسم المسافر الكامل (3 أحرف على الأقل).")).toBeVisible();
  await expect(page.getByText(/رقم الهاتف غير مكتمل أو غير صحيح/)).toBeVisible();
  await expect(page.locator('input[name="passengerPhone"]')).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("الاسم الكامل").fill("اختبار الحجز");
  await page.locator('input[name="passengerPhone"]').fill("+963944000000");
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("heading", { name: "راجع طلبك" })).toBeVisible();
  await expect(page.getByRole("button", { name: "تأكيد وإرسال الحجز" })).toBeVisible();
});
