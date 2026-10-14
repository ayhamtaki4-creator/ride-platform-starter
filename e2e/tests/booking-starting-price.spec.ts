import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test("booking routes display the lowest active private-car price from the API", async ({ page, request }) => {
  const response = await request.get(`${apiBaseURL}/routes`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const routes = (await response.json()) as Array<{
    id: string;
    bookable: boolean;
    pricingRules: Array<{ bookingType: string; vehicleClass: string; passengerPrice: string | number; currency: string }>;
  }>;
  const route = routes.find((item) => item.bookable);
  expect(route, "requires a seeded, bookable route").toBeTruthy();

  await page.route("**/api/routes", async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          ...route,
          bookingTypes: ["PRIVATE_CAR"],
          pricingRules: [
            { bookingType: "PRIVATE_CAR", vehicleClass: "SMALL", passengerPrice: 100, currency: "USD" },
            { bookingType: "PRIVATE_CAR", vehicleClass: "MEDIUM", passengerPrice: 60, currency: "USD" },
            { bookingType: "PRIVATE_CAR", vehicleClass: "LARGE", passengerPrice: 20, currency: "USD", isActive: false },
          ],
        },
      ]),
    });
  });

  await page.goto("/booking");
  const card = page.locator(".route-choice-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".route-starting-price")).toContainText("ابتداءً من");
  await expect(card.locator(".route-starting-price")).toContainText("٦٠");
  await expect(card.locator(".route-starting-price")).toContainText("$");
  await expect(page.getByText("السعر المبدئي لأقل فئة سيارة متاحة؛ يظهر السعر الدقيق بعد اختيار حجم السيارة.")).toBeVisible();
});
