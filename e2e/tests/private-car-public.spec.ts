import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("Private-car-only public booking policy", () => {
  test("public routes never expose legacy shared-seat pricing", async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/routes`);
    expect(response.ok()).toBeTruthy();

    const routes = (await response.json()) as Array<{
      id: string;
      bookable: boolean;
      bookingTypes: string[];
      pricingRules: Array<{ bookingType: string }>;
    }>;

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.bookable).toBe(true);
      expect(route.bookingTypes).toEqual(["PRIVATE_CAR"]);
      expect(route.pricingRules.length).toBeGreaterThan(0);
      expect(route.pricingRules.every((rule) => rule.bookingType === "PRIVATE_CAR")).toBe(true);
    }
  });

  test("public quote endpoint rejects legacy shared-seat requests", async ({ request }) => {
    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Array<{
      id: string;
      pricingRules: Array<{ bookingType: string; vehicleClass: string }>;
    }>;
    const route = routes[0];
    expect(route).toBeTruthy();

    const quote = await request.get(`${apiBaseURL}/bookings/quote`, {
      params: {
        routeId: route.id,
        bookingType: "SHARED_SEAT",
        vehicleClass: "SMALL",
        passengerCount: "1",
        luggageCount: "1",
      },
    });

    expect(quote.status()).toBe(400);
    const body = (await quote.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(" ")
      : String(body.message ?? "");
    expect(message).toContain("سيارة خاصة فقط");
  });
});
