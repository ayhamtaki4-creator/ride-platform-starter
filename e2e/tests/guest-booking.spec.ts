import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

const prisma = new PrismaClient();

function futureDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 20);
  return date.toISOString().slice(0, 10);
}

function phone() {
  return `+9639${randomInt(10000000, 99999999)}`;
}

async function bookAsGuest(request: APIRequestContext, phoneNumber: string, requestId: string) {
  const routesResponse = await request.get(`${apiBaseURL}/routes`);
  expect(routesResponse.ok()).toBeTruthy();
  const routes = (await routesResponse.json()) as Array<{
    id: string;
    bookable: boolean;
    requiresFlightDetails: boolean;
    origin: { nameAr: string };
    destination: { nameAr: string };
    pricingRules: Array<{ bookingType: string; vehicleClass: string; isActive?: boolean }>;
  }>;
  const route = routes.find((item) =>
    item.bookable && item.pricingRules.some((rule) => rule.bookingType === "PRIVATE_CAR" && rule.vehicleClass === "SMALL" && rule.isActive !== false),
  );
  expect(route).toBeTruthy();
  return request.post(`${apiBaseURL}/bookings/guest`, {
    data: {
      clientRequestId: requestId,
      routeId: route!.id,
      bookingType: "PRIVATE_CAR",
      vehicleClass: "SMALL",
      travelDate: futureDate(),
      flightArrivalTime: "13:30",
      flightNumber: "GUEST-TEST",
      passengerCount: 1,
      luggageCount: 1,
      pickupAddress: route!.origin.nameAr,
      dropoffAddress: route!.destination.nameAr,
      passengerName: "Guest Booking Test",
      passengerPhone: phoneNumber,
    },
  });
}

test.describe("Public guest booking", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("does not claim a pre-existing account using a phone number alone", async ({ request }) => {
    const number = phone();
    const email = `guest-test-${randomUUID()}@example.com`;
    const registration = await request.post(`${apiBaseURL}/auth/register`, {
      data: {
        firstName: "Existing",
        lastName: "Passenger",
        email,
        phone: number,
        password: "TestPassword123!",
        whatsappOptIn: false,
      },
    });
    expect(registration.status(), await registration.text()).toBe(201);
    const requestId = randomUUID();
    const response = await bookAsGuest(request, number, requestId);
    expect(response.status(), await response.text()).toBe(201);
    const receipt = (await response.json()) as { bookingReference: string; accepted: boolean };
    expect(receipt.accepted).toBe(true);
    expect(receipt).not.toHaveProperty("passengerId");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { clientRequestId: requestId } });
    expect(trip.passengerId).toBeNull();
    expect(trip.accountLinkStatus).toBe("UNLINKED");
    expect(trip.contactPhone).toBe(number);
  });

  test("allows a new guest to register normally while automatic account creation is paused", async ({ request }) => {
    const number = phone();
    const requestId = randomUUID();
    const response = await bookAsGuest(request, number, requestId);
    expect(response.status(), await response.text()).toBe(201);
    const receipt = (await response.json()) as { bookingReference: string; accepted: boolean };
    expect(receipt.accepted).toBe(true);
    const retry = await bookAsGuest(request, number, requestId);
    expect(retry.status(), await retry.text()).toBe(201);
    expect((await retry.json()).bookingReference).toBe(receipt.bookingReference);

    const provisional = await prisma.user.findUnique({ where: { phone: number } });
    expect(provisional).toBeNull();
    const bookings = await prisma.trip.findMany({ where: { clientRequestId: requestId } });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].passengerId).toBeNull();
    expect(bookings[0].accountLinkStatus).toBe("UNLINKED");
    expect(bookings[0].bookingSource).toBe("GUEST");

    const registration = await request.post(`${apiBaseURL}/auth/register`, {
      data: {
        firstName: "New",
        lastName: "Passenger",
        email: `after-guest-${randomUUID()}@example.com`,
        phone: number,
        password: "TestPassword123!",
        whatsappOptIn: false,
      },
    });
    expect(registration.status(), await registration.text()).toBe(201);
    const account = await prisma.user.findUniqueOrThrow({ where: { phone: number } });
    expect(account.status).toBe("ACTIVE");
    const originalGuestBooking = await prisma.trip.findUniqueOrThrow({ where: { clientRequestId: requestId } });
    expect(originalGuestBooking.passengerId).toBeNull();
  });
});
