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
};

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

    const createResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "SMALL",
        travelDate: futureDate(40),
        flightArrivalTime: "13:30",
        flightNumber: "EDIT-101",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: route.origin.nameAr,
        dropoffAddress: route.destination.nameAr,
        passengerName: "مسافر تعديل",
        passengerPhone: "+963944008822",
      },
    });
    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const booking = (await createResponse.json()) as Booking;

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

    const prisma = new PrismaClient();
    let driverId = "";
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
        select: { id: true },
      });
      driverId = driver.id;
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

    const prismaCheck = new PrismaClient();
    try {
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
