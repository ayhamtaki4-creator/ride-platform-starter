import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("First-party maps API", () => {
  test("rejects malformed geocoding and routing requests before calling an upstream provider", async ({ request }) => {
    const shortQuery = await request.get(
      `${apiBaseURL}/maps/geocode/search?query=x`,
    );
    expect(shortQuery.status()).toBe(400);

    const invalidReverse = await request.get(
      `${apiBaseURL}/maps/geocode/reverse?latitude=999&longitude=36.2765`,
    );
    expect(invalidReverse.status()).toBe(400);

    const incompleteRoute = await request.get(
      `${apiBaseURL}/maps/route?pickupLatitude=33.5138&pickupLongitude=36.2765&dropoffLatitude=33.8209`,
    );
    expect(incompleteRoute.status()).toBe(400);
  });
});
