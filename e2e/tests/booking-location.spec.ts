import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { apiLogin, bearer } from "../helpers/auth";
import { apiBaseURL } from "../helpers/accounts";

type Route = {
  id: string;
  code: string;
  origin: { nameAr: string };
  destination: { nameAr: string };
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

function futureDate(days = 2) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function routeGeometry(booking: Booking, pickup?: { latitude: number; longitude: number }) {
  const latitude = pickup?.latitude ?? booking.pickupLatitude;
  const longitude = pickup?.longitude ?? booking.pickupLongitude;
  return {
    type: "LineString",
    coordinates: [
      [longitude, latitude],
      [booking.dropoffLongitude, booking.dropoffLatitude],
    ],
  };
}

test.describe("Passenger-selected booking locations", () => {
  test("persists the rider pickup for rider, operations and tracking while protecting fixed airport endpoint", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    const route = routes.find((item) => item.code === "DAM-BEY-AIRPORT");
    expect(route, "Seeded Damascus → Beirut Airport route is required").toBeTruthy();

    const originalPickup = {
      address: `موقع المسافر التجريبي ${Date.now()}`,
      latitude: 33.506321,
      longitude: 36.291234,
    };

    const createResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route!.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "SMALL",
        travelDate: futureDate(),
        flightArrivalTime: "10:30",
        flightNumber: "E2E123",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: originalPickup.address,
        pickupLatitude: originalPickup.latitude,
        pickupLongitude: originalPickup.longitude,
        dropoffAddress: route!.destination.nameAr,
        passengerName: "مسافر اختبار الموقع",
        passengerPhone: "+963944000001",
      },
    });

    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const created = (await createResponse.json()) as Booking;
    expect(created.pickupAddress).toBe(originalPickup.address);
    expect(created.pickupLatitude).toBeCloseTo(originalPickup.latitude, 6);
    expect(created.pickupLongitude).toBeCloseTo(originalPickup.longitude, 6);
    expect(created.dropoffAddress).toBe(route!.destination.nameAr);

    const adminResponse = await request.get(`${apiBaseURL}/admin/bookings/${created.id}`, {
      headers: bearer(adminToken),
    });
    expect(adminResponse.ok()).toBeTruthy();
    const adminBooking = (await adminResponse.json()) as Booking;
    expect(adminBooking.pickupAddress).toBe(originalPickup.address);
    expect(adminBooking.pickupLatitude).toBeCloseTo(originalPickup.latitude, 6);
    expect(adminBooking.pickupLongitude).toBeCloseTo(originalPickup.longitude, 6);

    const trackingResponse = await request.get(`${apiBaseURL}/tracking/trips/${created.id}`, {
      headers: bearer(riderToken),
    });
    expect(trackingResponse.ok()).toBeTruthy();
    const tracking = (await trackingResponse.json()) as { trip: Booking };
    expect(tracking.trip.pickupAddress).toBe(originalPickup.address);
    expect(tracking.trip.pickupLatitude).toBeCloseTo(originalPickup.latitude, 6);

    const movedPickup = {
      address: `موقع المسافر المعدل ${Date.now()}`,
      latitude: 33.509876,
      longitude: 36.287654,
    };
    const endpointUpdate = await request.patch(`${apiBaseURL}/tracking/trips/${created.id}/endpoints`, {
      headers: bearer(riderToken),
      data: {
        originAddress: movedPickup.address,
        originLatitude: movedPickup.latitude,
        originLongitude: movedPickup.longitude,
        destinationAddress: created.dropoffAddress,
        destinationLatitude: created.dropoffLatitude,
        destinationLongitude: created.dropoffLongitude,
        geometry: routeGeometry(created, movedPickup),
        waypoints: [],
      },
    });
    expect(endpointUpdate.status(), await endpointUpdate.text()).toBe(200);

    const updatedTrackingResponse = await request.get(`${apiBaseURL}/tracking/trips/${created.id}`, {
      headers: bearer(riderToken),
    });
    expect(updatedTrackingResponse.ok()).toBeTruthy();
    const updatedTracking = (await updatedTrackingResponse.json()) as { trip: Booking };
    expect(updatedTracking.trip.pickupAddress).toBe(movedPickup.address);
    expect(updatedTracking.trip.pickupLatitude).toBeCloseTo(movedPickup.latitude, 6);
    expect(updatedTracking.trip.pickupLongitude).toBeCloseTo(movedPickup.longitude, 6);

    const forbiddenAirportChange = await request.patch(`${apiBaseURL}/tracking/trips/${created.id}/endpoints`, {
      headers: bearer(riderToken),
      data: {
        originAddress: movedPickup.address,
        originLatitude: movedPickup.latitude,
        originLongitude: movedPickup.longitude,
        destinationAddress: "مطار مختلف غير مسموح",
        destinationLatitude: created.dropoffLatitude + 0.01,
        destinationLongitude: created.dropoffLongitude + 0.01,
        geometry: {
          type: "LineString",
          coordinates: [
            [movedPickup.longitude, movedPickup.latitude],
            [created.dropoffLongitude + 0.01, created.dropoffLatitude + 0.01],
          ],
        },
        waypoints: [],
      },
    });
    expect(forbiddenAirportChange.status()).toBe(403);
  });
});
