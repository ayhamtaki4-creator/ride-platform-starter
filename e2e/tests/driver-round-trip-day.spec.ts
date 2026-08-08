import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { DriverDayAssignmentPolicyService } from "../../apps/api/src/admin/driver-day-assignment-policy.service";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  code: string;
  origin: { nameAr: string };
  destination: { nameAr: string };
};

type Booking = { id: string };

function futureDate(days = 4) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createBooking(
  request: APIRequestContext,
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
  test("counts completed runs, allows the exact return, and blocks a third run", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");

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

    const prisma = new PrismaClient();
    try {
      const driver = await prisma.driverProfile.findFirst({
        where: { vehicles: { some: { isActive: true } } },
        include: { vehicles: { where: { isActive: true }, take: 1 } },
      });
      expect(driver?.vehicles[0], "Seed data must contain a driver vehicle").toBeTruthy();

      const driverId = driver!.userId;
      const vehicle = driver!.vehicles[0];
      const at = new Date(`${travelDate}T12:00:00.000Z`);
      const policy = new DriverDayAssignmentPolicyService(prisma as never);

      const firstRun = await prisma.serviceRun.create({
        data: {
          runReference: `E2E-OUT-${randomUUID().slice(0, 8)}`,
          routeId: outbound!.id,
          bookingType: "PRIVATE_CAR",
          travelDate: at,
          driverId,
          vehicleId: vehicle.id,
          status: "COMPLETED",
          seatCapacity: vehicle.seatCapacity,
          reservedSeats: 1,
          completedAt: at,
        },
      });
      await prisma.trip.update({ where: { id: first.id }, data: { serviceRunId: firstRun.id } });

      await expect(policy.assertCanAssign(second.id, driverId)).resolves.toBeUndefined();

      const returnRun = await prisma.serviceRun.create({
        data: {
          runReference: `E2E-RET-${randomUUID().slice(0, 8)}`,
          routeId: inbound!.id,
          bookingType: "PRIVATE_CAR",
          travelDate: at,
          driverId,
          vehicleId: vehicle.id,
          status: "DRIVER_PENDING",
          seatCapacity: vehicle.seatCapacity,
          reservedSeats: 1,
        },
      });
      await prisma.trip.update({ where: { id: second.id }, data: { serviceRunId: returnRun.id } });

      await expect(policy.assertCanAssign(third.id, driverId)).rejects.toMatchObject({
        message: expect.stringContaining("رحلتا ذهاب وإياب"),
      });
    } finally {
      await prisma.$disconnect();
    }
  });
});
