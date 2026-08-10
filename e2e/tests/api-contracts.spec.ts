import { expect, test } from "@playwright/test";
import {
  apiLogin,
  bearer,
} from "../helpers/auth";
import { apiBaseURL } from "../helpers/accounts";
import { collectObjectKeys } from "../helpers/data";

test.describe("Read-only API contracts", () => {
  test("health endpoint responds successfully", async ({
    request,
  }) => {
    const response = await request.get(
      `${apiBaseURL}/health`,
    );

    expect(response.ok()).toBeTruthy();
  });

  test("legacy trip request surface stays retired", async ({ request }) => {
    const token = await apiLogin(request, "rider");
    const headers = bearer(token);

    const createResponse = await request.post(`${apiBaseURL}/trips`, {
      headers,
      data: {},
    });
    expect(createResponse.status()).toBe(404);

    const estimateResponse = await request.post(`${apiBaseURL}/trips/estimate`, {
      headers,
      data: {},
    });
    expect(estimateResponse.status()).toBe(404);

    const ownTripsResponse = await request.get(`${apiBaseURL}/trips/me`, {
      headers,
    });
    expect(ownTripsResponse.status()).toBe(404);

    const allTripsResponse = await request.get(`${apiBaseURL}/trips`, {
      headers,
    });
    expect(allTripsResponse.status()).toBe(404);
  });

  test("rider booking responses do not expose start PIN fields", async ({
    request,
  }) => {
    const token = await apiLogin(request, "rider");
    const response = await request.get(
      `${apiBaseURL}/bookings/me`,
      {
        headers: bearer(token),
      },
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const keys = collectObjectKeys(body);

    expect(keys.has("startPin")).toBeFalsy();
    expect(keys.has("startPinHash")).toBeFalsy();
  });

  test("admin driver details endpoint accepts userId used by the UI", async ({
    request,
  }) => {
    const token = await apiLogin(request, "admin");
    const listResponse = await request.get(
      `${apiBaseURL}/admin/drivers`,
      {
        headers: bearer(token),
      },
    );

    expect(listResponse.ok()).toBeTruthy();

    const drivers = (await listResponse.json()) as Array<{
      userId?: string;
    }>;

    test.skip(
      drivers.length === 0 || !drivers[0]?.userId,
      "No driver profile exists.",
    );

    const detailResponse = await request.get(
      `${apiBaseURL}/admin/drivers/${drivers[0].userId}`,
      {
        headers: bearer(token),
      },
    );

    expect(detailResponse.ok()).toBeTruthy();
  });

  test("admin booking detail endpoint opens the first booking", async ({
    request,
  }) => {
    const token = await apiLogin(request, "admin");
    const listResponse = await request.get(
      `${apiBaseURL}/admin/bookings`,
      {
        headers: bearer(token),
      },
    );

    expect(listResponse.ok()).toBeTruthy();

    const bookings = (await listResponse.json()) as Array<{
      id?: string;
    }>;

    test.skip(
      bookings.length === 0 || !bookings[0]?.id,
      "No booking exists.",
    );

    const detailResponse = await request.get(
      `${apiBaseURL}/admin/bookings/${bookings[0].id}`,
      {
        headers: bearer(token),
      },
    );

    expect(detailResponse.ok()).toBeTruthy();
  });
});
