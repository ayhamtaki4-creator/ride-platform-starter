import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  code: string;
  origin: { nameAr: string; latitude?: string | number | null; longitude?: string | number | null };
  destination: { nameAr: string; latitude?: string | number | null; longitude?: string | number | null };
};

type Booking = {
  id: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
};

type TrackingPayload = {
  trip: Booking & {
    estimatedDistanceKm?: number | null;
    estimatedDurationMinutes?: number | null;
  };
  routePlan: {
    geometry: { type: string; coordinates: number[][] };
    distanceKm?: number | null;
    durationMinutes?: number | null;
    version?: number;
  } | null;
};

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function coordinate(value: string | number | null | undefined, label: string) {
  const parsed = Number(value);
  expect(Number.isFinite(parsed), `${label} must be finite`).toBeTruthy();
  return parsed;
}

async function loadRoute(request: APIRequestContext, code: string) {
  const response = await request.get(`${apiBaseURL}/routes`);
  expect(response.status(), await response.text()).toBe(200);
  const routes = (await response.json()) as Route[];
  const route = routes.find((item) => item.code === code);
  expect(route, `Route ${code} is required`).toBeTruthy();
  return route!;
}

async function waitForManagedPlan(
  request: APIRequestContext,
  adminToken: string,
  tripId: string,
  pickup: { latitude: number; longitude: number },
  dropoff: { latitude: number; longitude: number },
) {
  let latest: TrackingPayload | null = null;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await request.get(`${apiBaseURL}/tracking/trips/${tripId}`, {
      headers: bearer(adminToken),
    });
    expect(response.status(), await response.text()).toBe(200);
    latest = (await response.json()) as TrackingPayload;

    const coordinates = latest.routePlan?.geometry.coordinates ?? [];
    const first = coordinates[0];
    const last = coordinates.at(-1);
    if (
      coordinates.length === 3 &&
      first &&
      last &&
      Math.abs(first[0] - pickup.longitude) < 0.000001 &&
      Math.abs(first[1] - pickup.latitude) < 0.000001 &&
      Math.abs(last[0] - dropoff.longitude) < 0.000001 &&
      Math.abs(last[1] - dropoff.latitude) < 0.000001 &&
      latest.routePlan?.distanceKm === 123.4 &&
      latest.routePlan?.durationMinutes === 150
    ) {
      return latest;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Managed route plan was not persisted in time: ${JSON.stringify(latest?.routePlan)}`);
}

test.describe("Managed route plan persistence", () => {
  test("persists road geometry and refreshes it after an idempotent pending-booking endpoint change", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");
    const route = await loadRoute(request, "DAM-BEY-AIRPORT");
    const dropoff = {
      latitude: coordinate(route.destination.latitude, "destination latitude"),
      longitude: coordinate(route.destination.longitude, "destination longitude"),
    };
    const firstPickup = {
      address: "الحسنية، ريف دمشق، سوريا",
      latitude: 33.583004,
      longitude: 36.093784,
    };
    const secondPickup = {
      address: "الديماس، ريف دمشق، سوريا",
      latitude: 33.5877734,
      longitude: 36.0921132,
    };
    const clientRequestId = randomUUID();

    const createPayload = {
      clientRequestId,
      routeId: route.id,
      bookingType: "PRIVATE_CAR",
      vehicleClass: "MEDIUM",
      travelDate: futureDate(15),
      flightArrivalTime: "19:15",
      flightNumber: "E2E-ROUTE-PLAN",
      passengerCount: 1,
      luggageCount: 1,
      pickupAddress: firstPickup.address,
      pickupLatitude: firstPickup.latitude,
      pickupLongitude: firstPickup.longitude,
      dropoffAddress: route.destination.nameAr,
      passengerName: "اختبار المسار الفعلي",
      passengerPhone: "+963944000013",
    };

    const createdResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: createPayload,
    });
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    const created = (await createdResponse.json()) as Booking;

    const firstPlan = await waitForManagedPlan(
      request,
      adminToken,
      created.id,
      firstPickup,
      dropoff,
    );
    expect(firstPlan.routePlan?.geometry.coordinates[1]).toEqual([35.85, 33.67]);
    expect(firstPlan.trip.estimatedDistanceKm).toBe(123.4);
    expect(firstPlan.trip.estimatedDurationMinutes).toBe(150);

    const refreshedResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        ...createPayload,
        pickupAddress: secondPickup.address,
        pickupLatitude: secondPickup.latitude,
        pickupLongitude: secondPickup.longitude,
      },
    });
    expect(refreshedResponse.status(), await refreshedResponse.text()).toBe(201);
    const refreshed = (await refreshedResponse.json()) as Booking;
    expect(refreshed.id).toBe(created.id);
    expect(refreshed.pickupAddress).toBe(secondPickup.address);
    expect(refreshed.pickupLatitude).toBeCloseTo(secondPickup.latitude, 6);
    expect(refreshed.pickupLongitude).toBeCloseTo(secondPickup.longitude, 6);

    const secondPlan = await waitForManagedPlan(
      request,
      adminToken,
      refreshed.id,
      secondPickup,
      dropoff,
    );
    const coordinates = secondPlan.routePlan!.geometry.coordinates;
    expect(coordinates).toHaveLength(3);
    expect(coordinates[0][0]).toBeCloseTo(secondPickup.longitude, 6);
    expect(coordinates[0][1]).toBeCloseTo(secondPickup.latitude, 6);
    expect(coordinates[1]).toEqual([35.85, 33.67]);
    expect(coordinates.at(-1)![0]).toBeCloseTo(dropoff.longitude, 6);
    expect(coordinates.at(-1)![1]).toBeCloseTo(dropoff.latitude, 6);
    expect(secondPlan.trip.estimatedDistanceKm).toBe(123.4);
    expect(secondPlan.trip.estimatedDurationMinutes).toBe(150);
  });
});
