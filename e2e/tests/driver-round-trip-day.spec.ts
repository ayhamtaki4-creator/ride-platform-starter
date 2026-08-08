import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  code: string;
  origin: { nameAr: string };
  destination: { nameAr: string };
};

type Booking = { id: string };
type EligibleDriver = {
  driverId: string;
  hasScheduleConflict: boolean;
  vehicles: Array<{ id: string }>;
};

function futureDate(days = 4) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createBooking(
  request: Parameters<typeof test>[0] extends never ? never : any,
  riderToken: string,
  route: Route,
  travelDate: string,
  suffix: string,
) {
  const response = await request.post(`${apiBaseURL}/bookings`, {
    headers: bearer(riderToken),
    data: {
      clientRequestId: randomUUID(),
      routeId: route.id,
      bookingType: "PRIVATE_CAR",
      vehicleClass: "SMALL",
      travelDate,
      flightArrivalTime: "12:00",
      flightNumber: `RT${suffix}`,
      passengerCount: 1,
      luggageCount: 1,
      pickupAddress: route.origin.nameAr,
      dropoffAddress: route.destination.nameAr,
      passengerName: `مسافر اختبار ${suffix}`,
      passengerPhone: `+96394400${suffix.padStart(4, "0")}`,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Booking;
}

test.describe("Driver same-day outbound and return", () => {
  test("accepts exact reverse as second run and rejects a third run", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    const outbound = routes.find((route) => route.code === "DAM-BEY-AIRPORT");
    const inbound = routes.find((route) => route.code === "BEY-AIRPORT-DAM");
    expect(outbound).toBeTruthy();
    expect(inbound).toBeTruthy();

    const travelDate = futureDate();
    const first = await createBooking(request, riderToken, outbound!, travelDate, "1");
    const second = await createBooking(request, riderToken, inbound!, travelDate, "2");
    const third = await createBooking(request, riderToken, outbound!, travelDate, "3");

    for (const booking of [first, second, third]) {
      const confirmation = await request.post(`${apiBaseURL}/admin/bookings/${booking.id}/confirm`, {
        headers: bearer(adminToken),
      });
      expect(confirmation.status(), await confirmation.text()).toBe(201);
    }

    const query = new URLSearchParams({
      travelDate: new Date(`${travelDate}T12:00:00.000Z`).toISOString(),
      vehicleClass: "SMALL",
      passengerCount: "1",
    });
    const eligibleResponse = await request.get(
      `${apiBaseURL}/admin/routes/${outbound!.id}/eligible-drivers?${query}`,
      { headers: bearer(adminToken) },
    );
    expect(eligibleResponse.ok()).toBeTruthy();
    const eligible = (await eligibleResponse.json()) as EligibleDriver[];
    const candidate = eligible.find((driver) => !driver.hasScheduleConflict && driver.vehicles.length > 0);
    expect(candidate, "Seed data must contain an eligible driver and vehicle").toBeTruthy();

    const assignment = {
      driverId: candidate!.driverId,
      vehicleId: candidate!.vehicles[0].id,
    };

    const firstAssignment = await request.post(`${apiBaseURL}/admin/trips/${first.id}/assign-driver`, {
      headers: bearer(adminToken),
      data: assignment,
    });
    expect(firstAssignment.status(), await firstAssignment.text()).toBe(201);

    const reverseAssignment = await request.post(`${apiBaseURL}/admin/trips/${second.id}/assign-driver`, {
      headers: bearer(adminToken),
      data: assignment,
    });
    expect(reverseAssignment.status(), await reverseAssignment.text()).toBe(201);

    const thirdAssignment = await request.post(`${apiBaseURL}/admin/trips/${third.id}/assign-driver`, {
      headers: bearer(adminToken),
      data: assignment,
    });
    expect(thirdAssignment.status()).toBe(409);
    const error = (await thirdAssignment.json()) as { message?: string };
    expect(error.message).toContain("رحلتا ذهاب وإياب");
  });
});
