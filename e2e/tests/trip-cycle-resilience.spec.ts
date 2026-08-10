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

type Booking = {
  id: string;
  status: string;
};

function futureDate(days = 45) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("Driver trip lifecycle resilience", () => {
  test("keeps the accepted private-car cycle ordered and synchronizes cash collection", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const driverToken = await apiLogin(request, "driver");
    const adminToken = await apiLogin(request, "admin");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    const route = routes.find((item) => item.code === "DAM-BEY-AIRPORT") ?? routes[0];
    expect(route).toBeTruthy();

    const travelDate = futureDate();
    const bookingResponse = await request.post(`${apiBaseURL}/bookings`, {
      headers: bearer(riderToken),
      data: {
        clientRequestId: randomUUID(),
        routeId: route.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: "SMALL",
        travelDate,
        flightArrivalTime: "13:30",
        flightNumber: "FLOW-E2E",
        passengerCount: 1,
        luggageCount: 1,
        pickupAddress: route.origin.nameAr,
        dropoffAddress: route.destination.nameAr,
        passengerName: "اختبار دورة الرحلة",
        passengerPhone: "+963944009876",
      },
    });
    expect(bookingResponse.status(), await bookingResponse.text()).toBe(201);
    const booking = (await bookingResponse.json()) as Booking;

    const prisma = new PrismaClient();
    try {
      const driver = await prisma.user.findUnique({
        where: { email: accounts.driver.email },
        select: {
          id: true,
          driverProfile: {
            select: {
              id: true,
              vehicles: {
                where: { isActive: true },
                take: 1,
                select: { id: true, seatCapacity: true },
              },
            },
          },
        },
      });
      expect(driver?.driverProfile?.vehicles[0]).toBeTruthy();
      const vehicle = driver!.driverProfile!.vehicles[0];

      const run = await prisma.serviceRun.create({
        data: {
          runReference: `E2E-FLOW-${randomUUID().slice(0, 8)}`,
          routeId: route.id,
          bookingType: "PRIVATE_CAR",
          travelDate: new Date(`${travelDate}T13:30:00.000Z`),
          driverId: driver!.id,
          vehicleId: vehicle.id,
          status: "DRIVER_PENDING",
          seatCapacity: vehicle.seatCapacity,
          reservedSeats: 1,
        },
      });

      await prisma.trip.update({
        where: { id: booking.id },
        data: {
          driverId: driver!.id,
          serviceRunId: run.id,
          status: "DRIVER_ASSIGNED",
          driverAssignmentStatus: "PENDING",
          assignedAt: new Date(),
        },
      });

      const acceptResponse = await request.post(`${apiBaseURL}/drivers/me/bookings/${booking.id}/accept`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(201);

      const prematureStart = await request.post(`${apiBaseURL}/trips/${booking.id}/start`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(prematureStart.status()).toBe(400);

      const arrivingResponse = await request.post(`${apiBaseURL}/trips/${booking.id}/arriving`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(arrivingResponse.status(), await arrivingResponse.text()).toBe(201);

      const arrivedResponse = await request.post(`${apiBaseURL}/trips/${booking.id}/arrived`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(arrivedResponse.status(), await arrivedResponse.text()).toBe(201);

      const startResponse = await request.post(`${apiBaseURL}/trips/${booking.id}/start`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(startResponse.status(), await startResponse.text()).toBe(201);
      const started = await startResponse.json();
      expect(started.status).toBe("IN_PROGRESS");

      const earlyCash = await request.post(`${apiBaseURL}/drivers/me/bookings/${booking.id}/cash-payment`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(earlyCash.status()).toBe(409);

      const afterStart = await prisma.trip.findUniqueOrThrow({
        where: { id: booking.id },
        select: {
          status: true,
          serviceRunPassengerStatus: true,
          startedAt: true,
          pickedUpAt: true,
        },
      });
      expect(afterStart.status).toBe("IN_PROGRESS");
      expect(afterStart.serviceRunPassengerStatus).toBe("PICKED_UP");
      expect(afterStart.startedAt).toBeTruthy();
      expect(afterStart.pickedUpAt).toBeTruthy();

      const runAfterStart = await prisma.serviceRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true, startedAt: true },
      });
      expect(runAfterStart.status).toBe("IN_PROGRESS");
      expect(runAfterStart.startedAt).toBeTruthy();

      const duplicateStart = await request.post(`${apiBaseURL}/trips/${booking.id}/start`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(duplicateStart.status()).toBe(400);

      const completeResponse = await request.post(`${apiBaseURL}/trips/${booking.id}/complete`, {
        headers: bearer(driverToken),
        data: { note: "E2E lifecycle completed" },
      });
      expect(completeResponse.status(), await completeResponse.text()).toBe(201);
      const completed = await completeResponse.json();
      expect(completed.status).toBe("COMPLETED");

      const afterComplete = await prisma.trip.findUniqueOrThrow({
        where: { id: booking.id },
        select: {
          status: true,
          serviceRunPassengerStatus: true,
          completedAt: true,
          droppedOffAt: true,
          finalFare: true,
          paymentStatus: true,
          amountPaid: true,
          statusHistory: {
            orderBy: { createdAt: "asc" },
            select: { to: true },
          },
        },
      });
      expect(afterComplete.status).toBe("COMPLETED");
      expect(afterComplete.serviceRunPassengerStatus).toBe("DROPPED_OFF");
      expect(afterComplete.completedAt).toBeTruthy();
      expect(afterComplete.droppedOffAt).toBeTruthy();
      expect(afterComplete.finalFare).not.toBeNull();
      expect(afterComplete.paymentStatus).toBe("UNPAID");
      expect(Number(afterComplete.amountPaid)).toBe(0);
      expect(afterComplete.statusHistory.map((entry) => entry.to)).toEqual(
        expect.arrayContaining([
          "DRIVER_ARRIVING",
          "DRIVER_ARRIVED",
          "IN_PROGRESS",
          "COMPLETED",
        ]),
      );

      const totalFare = Number(afterComplete.finalFare);
      const partialAmount = Number((totalFare / 2).toFixed(3));
      const partialPayment = await request.post(`${apiBaseURL}/admin/bookings/${booking.id}/payment`, {
        headers: bearer(adminToken),
        data: {
          amountPaid: partialAmount,
          receiver: "ADMIN",
          note: "E2E partial cash",
        },
      });
      expect(partialPayment.status(), await partialPayment.text()).toBe(201);
      const partial = await partialPayment.json();
      expect(partial.paymentStatus).toBe("PARTIALLY_PAID");
      expect(Number(partial.amountPaid)).toBe(partialAmount);
      expect(partial.paymentReceiver).toBe("ADMIN");

      const driverCannotOverwritePartial = await request.post(
        `${apiBaseURL}/drivers/me/bookings/${booking.id}/cash-payment`,
        {
          headers: bearer(driverToken),
          data: {},
        },
      );
      expect(driverCannotOverwritePartial.status()).toBe(409);

      const resetPayment = await request.post(`${apiBaseURL}/admin/bookings/${booking.id}/payment`, {
        headers: bearer(adminToken),
        data: { amountPaid: 0, receiver: "ADMIN", note: "Reset before driver collection" },
      });
      expect(resetPayment.status(), await resetPayment.text()).toBe(201);
      const reset = await resetPayment.json();
      expect(reset.paymentStatus).toBe("UNPAID");
      expect(Number(reset.amountPaid)).toBe(0);
      expect(reset.paymentReceiver).toBeNull();

      const driverPayment = await request.post(`${apiBaseURL}/drivers/me/bookings/${booking.id}/cash-payment`, {
        headers: bearer(driverToken),
        data: {},
      });
      expect(driverPayment.status(), await driverPayment.text()).toBe(201);
      const paid = await driverPayment.json();
      expect(paid.paymentStatus).toBe("PAID");
      expect(paid.paymentMethod).toBe("CASH");
      expect(paid.paymentReceiver).toBe("DRIVER");
      expect(Number(paid.amountPaid)).toBe(totalFare);

      const duplicateDriverPayment = await request.post(
        `${apiBaseURL}/drivers/me/bookings/${booking.id}/cash-payment`,
        {
          headers: bearer(driverToken),
          data: {},
        },
      );
      expect(duplicateDriverPayment.status(), await duplicateDriverPayment.text()).toBe(201);

      const dashboardResponse = await request.get(`${apiBaseURL}/admin/dashboard`, {
        headers: bearer(adminToken),
      });
      expect(dashboardResponse.status(), await dashboardResponse.text()).toBe(200);
      const dashboard = await dashboardResponse.json();
      expect(Number(dashboard.revenue)).toBeGreaterThanOrEqual(totalFare);
      expect(Number(dashboard.completedBookingValue)).toBeGreaterThanOrEqual(totalFare);

      const paymentAudit = await prisma.auditLog.findMany({
        where: {
          entityType: "Trip",
          entityId: booking.id,
          action: { startsWith: "booking.payment.cash" },
        },
        select: { action: true },
      });
      expect(paymentAudit.map((entry) => entry.action)).toEqual(
        expect.arrayContaining([
          "booking.payment.cash.update",
          "booking.payment.cash.received_by_driver",
        ]),
      );

      const runAfterComplete = await prisma.serviceRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true, completedAt: true },
      });
      expect(runAfterComplete.status).toBe("COMPLETED");
      expect(runAfterComplete.completedAt).toBeTruthy();

      const profile = await prisma.driverProfile.findUniqueOrThrow({
        where: { userId: driver!.id },
        select: { availability: true },
      });
      expect(profile.availability).toBe("ONLINE");
    } finally {
      await prisma.$disconnect();
    }
  });
});
