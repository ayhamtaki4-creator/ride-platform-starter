import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiLogin, bearer } from "../helpers/auth";
import { apiBaseURL } from "../helpers/accounts";

type Route = {
  id: string;
  code: string;
  origin: {
    nameAr: string;
    latitude?: string | number | null;
    longitude?: string | number | null;
  };
  destination: {
    nameAr: string;
    latitude?: string | number | null;
    longitude?: string | number | null;
  };
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
  trip: Booking;
  routePlan: {
    geometry: {
      type: string;
      coordinates: number[][];
    };
  } | null;
};

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function coordinate(value: string | number | null | undefined, label: string) {
  const parsed = Number(value);
  expect(Number.isFinite(parsed), `${label} must be a finite route coordinate`).toBeTruthy();
  return parsed;
}

async function saveProductionLikeTemplate(
  request: APIRequestContext,
  adminToken: string,
  route: Route,
) {
  const originLatitude = coordinate(route.origin.latitude, "origin latitude");
  const originLongitude = coordinate(route.origin.longitude, "origin longitude");
  const destinationLatitude = coordinate(route.destination.latitude, "destination latitude");
  const destinationLongitude = coordinate(route.destination.longitude, "destination longitude");

  const response = await request.patch(`${apiBaseURL}/admin/route-templates/${route.id}`, {
    headers: bearer(adminToken),
    data: {
      originAddress: route.origin.nameAr,
      originLatitude,
      originLongitude,
      destinationAddress: route.destination.nameAr,
      destinationLatitude,
      destinationLongitude,
      geometry: {
        type: "LineString",
        coordinates: [
          [originLongitude, originLatitude],
          [destinationLongitude, destinationLatitude],
        ],
      },
      waypoints: [],
    },
  });

  expect(response.status(), await response.text()).toBe(200);
}

async function loadRoute(request: APIRequestContext, code: string) {
  const response = await request.get(`${apiBaseURL}/routes`);
  expect(response.ok()).toBeTruthy();
  const routes = (await response.json()) as Route[];
  const route = routes.find((item) => item.code === code);
  expect(route, `Route ${code} is required`).toBeTruthy();
  return route!;
}

function expectRoutePlanEndpoints(
  tracking: TrackingPayload,
  pickup: { latitude: number; longitude: number },
  dropoff: { latitude: number; longitude: number },
) {
  expect(tracking.routePlan).not.toBeNull();
  const coordinates = tracking.routePlan!.geometry.coordinates;
  expect(coordinates.length).toBeGreaterThanOrEqual(2);
  expect(coordinates[0][0]).toBeCloseTo(pickup.longitude, 6);
  expect(coordinates[0][1]).toBeCloseTo(pickup.latitude, 6);
  expect(coordinates.at(-1)![0]).toBeCloseTo(dropoff.longitude, 6);
  expect(coordinates.at(-1)![1]).toBeCloseTo(dropoff.latitude, 6);
}

test.describe("Saved route templates never overwrite rider-selected endpoints", () => {
  test("Damascus to Beirut Airport preserves a custom Hasaniya pickup", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");
    const route = await loadRoute(request, "DAM-BEY-AIRPORT");
    await saveProductionLikeTemplate(request, adminToken, route);

    const selectedPickup = {
      address: "الحسنية, ناحية الديماس, منطقة قدسيا, محافظة ريف دمشق, سوريا",
      latitude: 33.583004,
      longitude: 36.093784,
    };
    const airportDropoff = {
      latitude: coordinate(route.destination.latitude, "destination latitude"),
      longitude: coordinate(route.destination.longitude, "destination longitude"),
    };

    const createResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "MEDIUM",
        travelDate: futureDate(11),
        flightArrivalTime: "19:15",
        flightNumber: "E2E-HASANIYA",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: selectedPickup.address,
        pickupLatitude: selectedPickup.latitude,
        pickupLongitude: selectedPickup.longitude,
        dropoffAddress: route.destination.nameAr,
        passengerName: "test map",
        passengerPhone: "+963944000011",
      },
    });

    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const booking = (await createResponse.json()) as Booking;
    expect(booking.pickupAddress).toBe(selectedPickup.address);
    expect(booking.pickupLatitude).toBeCloseTo(selectedPickup.latitude, 6);
    expect(booking.pickupLongitude).toBeCloseTo(selectedPickup.longitude, 6);
    expect(booking.dropoffAddress).toBe(route.destination.nameAr);

    const adminResponse = await request.get(`${apiBaseURL}/admin/bookings/${booking.id}`, {
      headers: bearer(adminToken),
    });
    expect(adminResponse.status(), await adminResponse.text()).toBe(200);
    const adminBooking = (await adminResponse.json()) as Booking;
    expect(adminBooking.pickupAddress).toBe(selectedPickup.address);
    expect(adminBooking.pickupLatitude).toBeCloseTo(selectedPickup.latitude, 6);
    expect(adminBooking.pickupLongitude).toBeCloseTo(selectedPickup.longitude, 6);

    const trackingResponse = await request.get(`${apiBaseURL}/tracking/trips/${booking.id}`, {
      headers: bearer(adminToken),
    });
    expect(trackingResponse.status(), await trackingResponse.text()).toBe(200);
    const tracking = (await trackingResponse.json()) as TrackingPayload;
    expect(tracking.trip.pickupAddress).toBe(selectedPickup.address);
    expectRoutePlanEndpoints(tracking, selectedPickup, airportDropoff);
  });

  test("Beirut Airport to Damascus preserves a custom Deimas dropoff", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");
    const route = await loadRoute(request, "BEY-AIRPORT-DAM");
    await saveProductionLikeTemplate(request, adminToken, route);

    const airportPickup = {
      latitude: coordinate(route.origin.latitude, "origin latitude"),
      longitude: coordinate(route.origin.longitude, "origin longitude"),
    };
    const selectedDropoff = {
      address: "الديماس, ناحية الديماس, منطقة قدسيا, محافظة ريف دمشق, سوريا",
      latitude: 33.5877734,
      longitude: 36.0921132,
    };

    const createResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "LARGE",
        travelDate: futureDate(12),
        flightArrivalTime: "18:30",
        flightNumber: "E2E-DEIMAS-TEMPLATE",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: route.origin.nameAr,
        dropoffAddress: selectedDropoff.address,
        dropoffLatitude: selectedDropoff.latitude,
        dropoffLongitude: selectedDropoff.longitude,
        passengerName: "اختبار الديماس مع القالب",
        passengerPhone: "+963944000012",
      },
    });

    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const booking = (await createResponse.json()) as Booking;
    expect(booking.pickupAddress).toBe(route.origin.nameAr);
    expect(booking.dropoffAddress).toBe(selectedDropoff.address);
    expect(booking.dropoffLatitude).toBeCloseTo(selectedDropoff.latitude, 6);
    expect(booking.dropoffLongitude).toBeCloseTo(selectedDropoff.longitude, 6);

    const adminResponse = await request.get(`${apiBaseURL}/admin/bookings/${booking.id}`, {
      headers: bearer(adminToken),
    });
    expect(adminResponse.status(), await adminResponse.text()).toBe(200);
    const adminBooking = (await adminResponse.json()) as Booking;
    expect(adminBooking.dropoffAddress).toBe(selectedDropoff.address);
    expect(adminBooking.dropoffLatitude).toBeCloseTo(selectedDropoff.latitude, 6);
    expect(adminBooking.dropoffLongitude).toBeCloseTo(selectedDropoff.longitude, 6);

    const trackingResponse = await request.get(`${apiBaseURL}/tracking/trips/${booking.id}`, {
      headers: bearer(adminToken),
    });
    expect(trackingResponse.status(), await trackingResponse.text()).toBe(200);
    const tracking = (await trackingResponse.json()) as TrackingPayload;
    expect(tracking.trip.dropoffAddress).toBe(selectedDropoff.address);
    expectRoutePlanEndpoints(tracking, airportPickup, selectedDropoff);
  });
});
