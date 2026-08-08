import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("First-party maps API", () => {
  test("proxies forward and reverse geocoding without exposing the provider token", async ({ request }) => {
    const search = await request.get(
      `${apiBaseURL}/maps/geocode/search?query=${encodeURIComponent("دمشق")}&limit=6`,
    );
    expect(search.status(), await search.text()).toBe(200);
    const searchBody = (await search.json()) as {
      provider: string;
      items: Array<{
        label: string;
        latitude: number;
        longitude: number;
        city?: string;
        countryCode?: string;
      }>;
    };
    expect(searchBody.provider).toBe("mapbox");
    expect(searchBody.items[0]).toMatchObject({
      label: "دمشق، سوريا",
      latitude: 33.5138,
      longitude: 36.2765,
      city: "دمشق",
      countryCode: "SY",
    });
    expect(JSON.stringify(searchBody)).not.toContain("mobile-e2e-mapbox-token");

    const reverse = await request.get(
      `${apiBaseURL}/maps/geocode/reverse?latitude=33.583004&longitude=36.093784`,
    );
    expect(reverse.status(), await reverse.text()).toBe(200);
    const reverseBody = (await reverse.json()) as {
      provider: string;
      item: { label: string; latitude: number; longitude: number } | null;
    };
    expect(reverseBody.provider).toBe("mapbox");
    expect(reverseBody.item).toMatchObject({
      label: "الحسنية، ريف دمشق، سوريا",
      latitude: 33.583004,
      longitude: 36.093784,
    });
  });

  test("returns a normalized driving route with distance and duration", async ({ request }) => {
    const response = await request.get(
      `${apiBaseURL}/maps/route?pickupLatitude=33.583004&pickupLongitude=36.093784&dropoffLatitude=33.8209&dropoffLongitude=35.4884`,
    );
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      provider: string;
      route: {
        geometry: { type: string; coordinates: number[][] };
        distanceKm: number;
        durationMinutes: number;
      } | null;
    };
    expect(body.provider).toBe("mapbox");
    expect(body.route?.geometry.type).toBe("LineString");
    expect(body.route?.geometry.coordinates[0]).toEqual([36.093784, 33.583004]);
    expect(body.route?.geometry.coordinates.at(-1)).toEqual([35.4884, 33.8209]);
    expect(body.route?.distanceKm).toBe(123.4);
    expect(body.route?.durationMinutes).toBe(150);
  });

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
