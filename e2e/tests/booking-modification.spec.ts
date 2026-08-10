import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  code: string;
  requiresFlightDetails?: boolean;
  origin: { nameAr: string };
  destination: { nameAr: string };
};

type Booking = {
  id: string;
  travelDate: string;
  passengerCount: number;
  dropoffAddress: string;
  estimatedFare: string | number;
  currency: string;
  notes?: string | null;
};

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createBooking(
  request: Parameters<typeof apiLogin>[0],
  riderToken: string,
  route: Route,
  days: number,
  suffix: string,
) {
  const response = await request.post(`${apiBaseURL}/bookings`, {
    headers: bearer(riderToken),
    data: {
      clientRequestId: randomUUID(),
      routeId: route.id,
      bookingType: "PRIVATE_CAR",
      vehicleClass: "SMALL",
      travelDate: futureDate(days),
      flightArrivalTime: "13:30",
      flightNumber: `EDIT-${suffix}`,
      passengerCount: 1,
      luggageCount: 1,
      pickupAddress: route.origin.nameAr,
      dropoffAddress: route.destination.nameAr,
      passengerName: `مسافر تعديل ${suffix}`,
      passengerPhone: "+963944008822",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Booking;
}

test.describe.serial("Booking modification", () => {
  test("allows safe passenger edits and requires operations after driver assignment", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    const route = routes.find((item) => item.code === "DAM-BEY-AIRPORT") ?? routes[0];
    expect(route).toBeTruthy();

    const booking = await createBooking(request, riderToken, route, 40, "101");

    const passengerUpdate = await request.patch(`${apiBaseURL}/bookings/${booking.id}`, {
      headers: bearer(riderToken),
      data: {
        travelDate: futureDate(42),
        passengerCount: 2,
        flightArrivalTime: "15:45",
        flightNumber: "EDIT-102",
        notes: "تعديل من المسافر قبل التعيين",
      },
    });
    expect(passengerUpdate.status(), await passengerUpdate.text()).toBe(200);
    const passengerUpdated = (await passengerUpdate.json()) as Booking;
    expect(passengerUpdated.passengerCount).toBe(2);
    expect(passengerUpdated.travelDate.slice(0, 10)).toBe(futureDate(42));

    if (route.destination.nameAr.includes("مطار")) {
      const protectedEndpoint = await request.patch(`${apiBaseURL}/bookings/${booking.id}`, {
        headers: bearer(riderToken),
        data: { dropoffAddress: "نقطة وصول بديلة غير مسموحة" },
      });
      expect(protectedEndpoint.status()).toBe(400);
    }

    const legacyOverride = await request.patch(`${apiBaseURL}/admin/booking-control/${booking.id}`, {
      headers: bearer(adminToken),
      data: {
        contactName: "مسافر تعديل 101",
        contactPhone: "+963944008822",
        travelDate: futureDate(42),
        flightArrivalTime: "15:45",
        flightNumber: "EDIT-102",
        passengerCount: 2,
        luggageCount: 1,
        vehicleClass: "SMALL",
        notes: "المسار القديم يمر الآن عبر قواعد التعديل الآمنة",
        estimatedFare: 1,
        currency: "EUR",
      },
    });
    expect(legacyOverride.status(), await legacyOverride.text()).toBe(200);
    const legacyUpdated = (await legacyOverride.json()) as Booking;
    expect(Number(legacyUpdated.estimatedFare)).not.toBe(1);
    expect(legacyUpdated.currency).toBe(passengerUpdated.currency);
    expect(legacyUpdated.notes).toContain("قواعد التعديل الآمنة");

    const prisma = new PrismaClient();
    let driverId = "";
    let vehicleId = "";
    try {
      const driver = await prisma.user.create({
        data: {
          email: `booking-edit-driver-${randomUUID()}@example.com`,
          passwordHash: "e2e-not-used",
          firstName: "سائق",
          lastName: "تعديل",
          driverProfile: {
            create: {
              status: "APPROVED",
              availability: "OFFLINE",
              vehicles: {
                create: {
                  make: "Toyota",
                  model: "Test",
                  year: 2025,
                  color: "White",
                  plateNumber: `EDIT-${randomUUID().slice(0, 8)}`,
                  seatCapacity: 4,
                  isActive: true,
                },
              },
            },
          },
        },
        select: {
          id: true,
          driverProfile: {
            select: {
              vehicles: { select: { id: true }, take: 1 },
            },
          },
        },
      });
      driverId = driver.id;
      vehicleId = driver.driverProfile?.vehicles[0]?.id ?? "";
      expect(vehicleId).toBeTruthy();
      await prisma.trip.update({
        where: { id: booking.id },
        data: {
          driverId,
          status: "DRIVER_ASSIGNED",
          driverAssignmentStatus: "ACCEPTED",
          assignedAt: new Date(),
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    const passengerAfterAssignment = await request.patch(`${apiBaseURL}/bookings/${booking.id}`, {
      headers: bearer(riderToken),
      data: { travelDate: futureDate(43) },
    });
    expect(passengerAfterAssignment.status()).toBe(409);

    const adminWithoutReason = await request.patch(`${apiBaseURL}/admin/bookings/${booking.id}`, {
      headers: bearer(adminToken),
      data: { travelDate: futureDate(43) },
    });
    expect(adminWithoutReason.status()).toBe(400);

    const adminUpdate = await request.patch(`${apiBaseURL}/admin/bookings/${booking.id}`, {
      headers: bearer(adminToken),
      data: {
        travelDate: futureDate(43),
        flightArrivalTime: "17:10",
        flightNumber: "EDIT-ADMIN",
        changeNote: "تعديل الموعد بعد اتصال المسافر بمركز العمليات",
      },
    });
    expect(adminUpdate.status(), await adminUpdate.text()).toBe(200);
    const adminUpdated = (await adminUpdate.json()) as Booking;
    expect(adminUpdated.travelDate.slice(0, 10)).toBe(futureDate(43));

    const serviceRunBooking = await createBooking(request, riderToken, route, 60, "RUN");
    const prismaRun = new PrismaClient();
    let serviceRunId = "";
    try {
      const run = await prismaRun.serviceRun.create({
        data: {
          runReference: `RUN-EDIT-${randomUUID().slice(0, 8)}`,
          routeId: route.id,
          bookingType: "PRIVATE_CAR",
          travelDate: new Date(`${futureDate(60)}T00:00:00.000Z`),
          driverId,
          vehicleId,
          status: "DRIVER_ACCEPTED",
          seatCapacity: 2,
          reservedSeats: 1,
        },
        select: { id: true },
      });
      serviceRunId = run.id;
      await prismaRun.trip.update({
        where: { id: serviceRunBooking.id },
        data: {
          serviceRunId,
          driverId,
          status: "DRIVER_ASSIGNED",
          bookingReviewStatus: "CONFIRMED",
          driverAssignmentStatus: "ACCEPTED",
          assignedAt: new Date(),
        },
      });
    } finally {
      await prismaRun.$disconnect();
    }

    const increaseRunPassengers = await request.patch(
      `${apiBaseURL}/admin/bookings/${serviceRunBooking.id}`,
      {
        headers: bearer(adminToken),
        data: {
          passengerCount: 2,
          changeNote: "إضافة مسافر إلى الحجز المرتبط بالرحلة التشغيلية",
        },
      },
    );
    expect(increaseRunPassengers.status(), await increaseRunPassengers.text()).toBe(200);

    const capacityOverflow = await request.patch(
      `${apiBaseURL}/admin/bookings/${serviceRunBooking.id}`,
      {
        headers: bearer(adminToken),
        data: {
          passengerCount: 3,
          changeNote: "اختبار منع تجاوز سعة الرحلة التشغيلية",
        },
      },
    );
    expect(capacityOverflow.status()).toBe(409);

    const prismaCheck = new PrismaClient();
    try {
      const run = await prismaCheck.serviceRun.findUniqueOrThrow({ where: { id: serviceRunId } });
      expect(run.reservedSeats).toBe(2);

      const audit = await prismaCheck.auditLog.findFirst({
        where: {
          entityId: booking.id,
          action: "booking.update.admin",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeTruthy();
      const notification = await prismaCheck.notification.findFirst({
        where: {
          entityId: booking.id,
          type: "BOOKING_DETAILS_UPDATED",
        },
      });
      expect(notification).toBeTruthy();
      expect(driverId).toBeTruthy();
    } finally {
      await prismaCheck.$disconnect();
    }
  });
});
