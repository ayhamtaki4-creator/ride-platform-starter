import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { accounts, apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  code: string;
  origin: { nameAr: string };
  destination: { nameAr: string };
};

type Booking = { id: string };

type LiveLocation = {
  latitude: number;
  longitude: number;
  recordedAt?: Date;
};

type AdminTrackingTrip = {
  tripId: string;
  bookingReference: string | null;
  status: string;
  driverId: string;
  liveLocation: {
    latitude: number;
    longitude: number;
    recordedAt: string;
  } | null;
};

function futureDate(days = 5) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("Server-side driver GPS throttling", () => {
  test("drops rapid and stale ingress before it can overwrite the stored location", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const driverToken = await apiLogin(request, "driver");
    const adminToken = await apiLogin(request, "admin");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    const route = routes.find((item) => item.code === "DAM-BEY-AIRPORT") ?? routes[0];
    expect(route).toBeTruthy();

    const bookingResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "SMALL",
        travelDate: futureDate(),
        flightArrivalTime: "14:00",
        flightNumber: "GPS-E2E",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: route.origin.nameAr,
        dropoffAddress: route.destination.nameAr,
        passengerName: "اختبار GPS",
        passengerPhone: "+963944001234",
      },
    });
    expect(bookingResponse.status(), await bookingResponse.text()).toBe(201);
    const booking = (await bookingResponse.json()) as Booking;

    const prisma = new PrismaClient();
    try {
      const driver = await prisma.user.findUnique({
        where: { email: accounts.driver.email },
        select: { id: true },
      });
      expect(driver).toBeTruthy();

      await prisma.trip.update({
        where: { id: booking.id },
        data: {
          driverId: driver!.id,
          status: "DRIVER_ASSIGNED",
        },
      });

      const firstRecordedAt = new Date().toISOString();
      const firstResponse = await request.post(`${apiBaseURL}/tracking/trips/${booking.id}/location`, {
        headers: bearer(driverToken),
        data: {
          latitude: 33.5101,
          longitude: 36.2911,
          accuracy: 8,
          recordedAt: firstRecordedAt,
        },
      });
      expect(firstResponse.status(), await firstResponse.text()).toBe(201);
      const firstBody = await firstResponse.json();
      expect(firstBody.throttled).toBe(false);
      expect(firstBody.accepted).toBe(true);
      expect(firstBody.ignoredStale).toBe(false);

      const rapidResponse = await request.post(`${apiBaseURL}/tracking/trips/${booking.id}/location`, {
        headers: bearer(driverToken),
        data: {
          latitude: 33.6101,
          longitude: 36.3911,
          accuracy: 7,
          recordedAt: new Date().toISOString(),
        },
      });
      expect(rapidResponse.status(), await rapidResponse.text()).toBe(201);
      const rapidBody = await rapidResponse.json();
      expect(rapidBody.throttled).toBe(true);
      expect(rapidBody.retryAfterMs).toBeGreaterThan(0);

      const rowsAfterRapid = await prisma.$queryRaw<LiveLocation[]>`
        SELECT "latitude", "longitude", "recordedAt"
        FROM "TripLiveLocation"
        WHERE "tripId" = ${booking.id}::uuid
        LIMIT 1
      `;
      expect(rowsAfterRapid[0]?.latitude).toBeCloseTo(33.5101, 5);
      expect(rowsAfterRapid[0]?.longitude).toBeCloseTo(36.2911, 5);

      await new Promise((resolve) => setTimeout(resolve, 1700));

      const laterRecordedAt = new Date().toISOString();
      const laterResponse = await request.post(`${apiBaseURL}/tracking/trips/${booking.id}/location`, {
        headers: bearer(driverToken),
        data: {
          latitude: 33.7101,
          longitude: 36.4911,
          accuracy: 6,
          recordedAt: laterRecordedAt,
        },
      });
      expect(laterResponse.status(), await laterResponse.text()).toBe(201);
      const laterBody = await laterResponse.json();
      expect(laterBody.throttled).toBe(false);
      expect(laterBody.accepted).toBe(true);
      expect(laterBody.ignoredStale).toBe(false);

      const rowsAfterLater = await prisma.$queryRaw<LiveLocation[]>`
        SELECT "latitude", "longitude", "recordedAt"
        FROM "TripLiveLocation"
        WHERE "tripId" = ${booking.id}::uuid
        LIMIT 1
      `;
      expect(rowsAfterLater[0]?.latitude).toBeCloseTo(33.7101, 5);
      expect(rowsAfterLater[0]?.longitude).toBeCloseTo(36.4911, 5);

      const adminTrackingResponse = await request.get(`${apiBaseURL}/admin/tracking/active-trips`, {
        headers: bearer(adminToken),
      });
      expect(adminTrackingResponse.status(), await adminTrackingResponse.text()).toBe(200);
      const adminTrackingTrips = (await adminTrackingResponse.json()) as AdminTrackingTrip[];
      const monitoredTrip = adminTrackingTrips.find((trip) => trip.tripId === booking.id);
      expect(monitoredTrip).toBeTruthy();
      expect(monitoredTrip?.driverId).toBe(driver!.id);
      expect(monitoredTrip?.status).toBe("DRIVER_ASSIGNED");
      expect(monitoredTrip?.liveLocation?.latitude).toBeCloseTo(33.7101, 5);
      expect(monitoredTrip?.liveLocation?.longitude).toBeCloseTo(36.4911, 5);
      expect(monitoredTrip?.liveLocation?.recordedAt).toBe(laterRecordedAt);

      await new Promise((resolve) => setTimeout(resolve, 1700));

      const staleResponse = await request.post(`${apiBaseURL}/tracking/trips/${booking.id}/location`, {
        headers: bearer(driverToken),
        data: {
          latitude: 34.1101,
          longitude: 37.0911,
          accuracy: 5,
          recordedAt: firstRecordedAt,
        },
      });
      expect(staleResponse.status(), await staleResponse.text()).toBe(201);
      const staleBody = await staleResponse.json();
      expect(staleBody.throttled).toBe(false);
      expect(staleBody.accepted).toBe(false);
      expect(staleBody.ignoredStale).toBe(true);

      const rowsAfterStale = await prisma.$queryRaw<LiveLocation[]>`
        SELECT "latitude", "longitude", "recordedAt"
        FROM "TripLiveLocation"
        WHERE "tripId" = ${booking.id}::uuid
        LIMIT 1
      `;
      expect(rowsAfterStale[0]?.latitude).toBeCloseTo(33.7101, 5);
      expect(rowsAfterStale[0]?.longitude).toBeCloseTo(36.4911, 5);
      expect(rowsAfterStale[0]?.recordedAt?.toISOString()).toBe(laterRecordedAt);
    } finally {
      await prisma.$disconnect();
    }
  });
});
