import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  code: string;
  origin: { nameAr: string };
  destination: { nameAr: string };
};

type BookingResponse = {
  id: string;
  estimatedFare: string | number;
};

type FinanceDetail = {
  balances: Array<{
    currency: string;
    balance: string;
    balanceDirection: "PLATFORM_OWES_DRIVER" | "DRIVER_OWES_PLATFORM" | "SETTLED";
  }>;
  entries: Array<{
    tripId: string | null;
    type: string;
    balanceDelta: string;
  }>;
  settlements: Array<{
    id: string;
    direction: "TO_DRIVER" | "TO_PLATFORM";
    amount: string;
  }>;
};

function futureDate(days = 50) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function usdBalance(detail: FinanceDetail) {
  return Number(detail.balances.find((row) => row.currency === "USD")?.balance ?? 0);
}

async function createCompletedBooking(
  request: Parameters<typeof test>[0] extends never ? never : any,
  riderToken: string,
  route: Route,
  driverId: string,
  suffix: string,
) {
  const bookingResponse = await request.post(`${apiBaseURL}/bookings`, {
    headers: bearer(riderToken),
    data: {
      clientRequestId: randomUUID(),
      routeId: route.id,
      bookingType: "PRIVATE_CAR",
      vehicleClass: "SMALL",
      travelDate: futureDate(),
      flightArrivalTime: "13:30",
      flightNumber: `FIN-${suffix}`,
      passengerCount: 1,
      luggageCount: 1,
      pickupAddress: route.origin.nameAr,
      dropoffAddress: route.destination.nameAr,
      passengerName: `اختبار مالي ${suffix}`,
      passengerPhone: "+963944008811",
    },
  });
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201);
  const booking = (await bookingResponse.json()) as BookingResponse;

  const prisma = new PrismaClient();
  try {
    const current = await prisma.trip.findUniqueOrThrow({ where: { id: booking.id } });
    await prisma.trip.update({
      where: { id: booking.id },
      data: {
        driverId,
        status: "COMPLETED",
        bookingReviewStatus: "CONFIRMED",
        driverAssignmentStatus: "ACCEPTED",
        finalFare: current.estimatedFare,
        completedAt: new Date(),
      },
    });
    return await prisma.trip.findUniqueOrThrow({ where: { id: booking.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("Driver financial settlements", () => {
  test("keeps driver/platform obligations balanced and serializes duplicate settlements", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const adminToken = await apiLogin(request, "admin");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    const route = routes.find((item) => item.code === "DAM-BEY-AIRPORT") ?? routes[0];
    expect(route).toBeTruthy();

    const prisma = new PrismaClient();
    const driver = await prisma.user.create({
      data: {
        email: `finance-driver-${randomUUID()}@example.com`,
        passwordHash: "e2e-not-used",
        firstName: "سائق",
        lastName: "مالي",
        driverProfile: {
          create: {
            status: "APPROVED",
            availability: "OFFLINE",
          },
        },
      },
      select: { id: true },
    });
    await prisma.$disconnect();

    const adminCollectedTrip = await createCompletedBooking(
      request,
      riderToken,
      route,
      driver.id,
      "ADMIN",
    );

    const adminPayment = await request.post(`${apiBaseURL}/admin/bookings/${adminCollectedTrip.id}/payment`, {
      headers: bearer(adminToken),
      data: {
        amountPaid: Number(adminCollectedTrip.finalFare ?? adminCollectedTrip.estimatedFare),
        receiver: "ADMIN",
        note: "Finance E2E admin collection",
      },
    });
    expect(adminPayment.status(), await adminPayment.text()).toBe(201);

    const afterAdminCollectionResponse = await request.get(`${apiBaseURL}/admin/driver-finance/${driver.id}`, {
      headers: bearer(adminToken),
    });
    expect(afterAdminCollectionResponse.ok()).toBeTruthy();
    const afterAdminCollection = (await afterAdminCollectionResponse.json()) as FinanceDetail;
    expect(usdBalance(afterAdminCollection)).toBeCloseTo(Number(adminCollectedTrip.driverFee), 3);
    expect(afterAdminCollection.entries.some((entry) =>
      entry.tripId === adminCollectedTrip.id &&
      entry.type === "TRIP_POSITION" &&
      Number(entry.balanceDelta) > 0
    )).toBeTruthy();

    const settlementAmount = Number(adminCollectedTrip.driverFee);
    const duplicateSettlements = await Promise.all([
      request.post(`${apiBaseURL}/admin/driver-finance/${driver.id}/settlements`, {
        headers: bearer(adminToken),
        data: { amount: settlementAmount, currency: "USD", note: "Concurrent settlement A" },
      }),
      request.post(`${apiBaseURL}/admin/driver-finance/${driver.id}/settlements`, {
        headers: bearer(adminToken),
        data: { amount: settlementAmount, currency: "USD", note: "Concurrent settlement B" },
      }),
    ]);
    const statuses = duplicateSettlements.map((response) => response.status()).sort();
    expect(statuses).toEqual([201, 409]);

    const afterDriverPayoutResponse = await request.get(`${apiBaseURL}/admin/driver-finance/${driver.id}`, {
      headers: bearer(adminToken),
    });
    const afterDriverPayout = (await afterDriverPayoutResponse.json()) as FinanceDetail;
    expect(usdBalance(afterDriverPayout)).toBeCloseTo(0, 3);
    expect(afterDriverPayout.settlements.filter((row) => row.direction === "TO_DRIVER")).toHaveLength(1);

    const driverCollectedTrip = await createCompletedBooking(
      request,
      riderToken,
      route,
      driver.id,
      "DRIVER",
    );

    const driverPayment = await request.post(`${apiBaseURL}/admin/bookings/${driverCollectedTrip.id}/payment`, {
      headers: bearer(adminToken),
      data: {
        amountPaid: Number(driverCollectedTrip.finalFare ?? driverCollectedTrip.estimatedFare),
        receiver: "DRIVER",
        note: "Finance E2E driver collection",
      },
    });
    expect(driverPayment.status(), await driverPayment.text()).toBe(201);

    const afterDriverCollectionResponse = await request.get(`${apiBaseURL}/admin/driver-finance/${driver.id}`, {
      headers: bearer(adminToken),
    });
    const afterDriverCollection = (await afterDriverCollectionResponse.json()) as FinanceDetail;
    expect(usdBalance(afterDriverCollection)).toBeCloseTo(-Number(driverCollectedTrip.platformMargin), 3);
    expect(afterDriverCollection.entries.some((entry) =>
      entry.tripId === driverCollectedTrip.id &&
      entry.type === "TRIP_POSITION" &&
      Number(entry.balanceDelta) < 0
    )).toBeTruthy();

    const overSettlement = await request.post(`${apiBaseURL}/admin/driver-finance/${driver.id}/settlements`, {
      headers: bearer(adminToken),
      data: {
        amount: Number(driverCollectedTrip.platformMargin) + 1,
        currency: "USD",
      },
    });
    expect(overSettlement.status()).toBe(409);

    const platformSettlement = await request.post(`${apiBaseURL}/admin/driver-finance/${driver.id}/settlements`, {
      headers: bearer(adminToken),
      data: {
        amount: Number(driverCollectedTrip.platformMargin),
        currency: "USD",
        note: "Driver handed platform margin to administration",
      },
    });
    expect(platformSettlement.status(), await platformSettlement.text()).toBe(201);

    const finalResponse = await request.get(`${apiBaseURL}/admin/driver-finance/${driver.id}`, {
      headers: bearer(adminToken),
    });
    const finalDetail = (await finalResponse.json()) as FinanceDetail;
    expect(usdBalance(finalDetail)).toBeCloseTo(0, 3);
    expect(finalDetail.settlements.some((row) => row.direction === "TO_PLATFORM")).toBeTruthy();
  });
});
