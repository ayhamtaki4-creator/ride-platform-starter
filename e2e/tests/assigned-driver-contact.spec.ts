import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

test.describe("Assigned driver contact", () => {
  test("booking owner receives the driver phone while assignment is still pending", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Array<{
      id: string;
      code: string;
      origin: { nameAr: string };
      destination: { nameAr: string };
    }>;
    const route = routes.find((item) => item.code === "DAM-BEY-AIRPORT");
    expect(route).toBeTruthy();

    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 6);
    const travelDate = date.toISOString().slice(0, 10);
    const createResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route!.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "SMALL",
        travelDate,
        flightArrivalTime: "14:30",
        flightNumber: "WA123",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: route!.origin.nameAr,
        dropoffAddress: route!.destination.nameAr,
        passengerName: "مسافر اختبار واتساب",
        passengerPhone: "+963944009999",
      },
    });
    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const booking = (await createResponse.json()) as { id: string };

    const prisma = new PrismaClient();
    const expectedPhone = `+963944${String(Date.now()).slice(-6)}`;
    try {
      const driver = await prisma.driverProfile.findFirst({
        include: { user: { select: { id: true } } },
      });
      expect(driver, "Seed data must contain a driver").toBeTruthy();

      await prisma.user.update({
        where: { id: driver!.user.id },
        data: { phone: expectedPhone },
      });
      await prisma.trip.update({
        where: { id: booking.id },
        data: {
          driverId: driver!.user.id,
          status: "DRIVER_ASSIGNED",
          driverAssignmentStatus: "PENDING",
          assignedAt: new Date(),
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    const contactResponse = await request.get(`${apiBaseURL}/bookings/${booking.id}/driver-contact`, {
      headers: bearer(riderToken),
    });
    expect(contactResponse.ok()).toBeTruthy();
    const contact = (await contactResponse.json()) as {
      assigned: boolean;
      driver: { phone: string | null } | null;
    };
    expect(contact.assigned).toBe(true);
    expect(contact.driver?.phone).toBe(expectedPhone);
  });
});
