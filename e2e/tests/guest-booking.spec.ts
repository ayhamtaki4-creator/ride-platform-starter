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
  test("claims a guest booking only with its secret proof and matching registered phone", async ({ request }) => {
    const guestPhone = phone();
    const otherPhone = phone();
    const secret = randomUUID();
    const response = await bookAsGuest(request, guestPhone, secret);
    expect(response.status(), await response.text()).toBe(201);
    const { bookingReference } = (await response.json()) as { bookingReference: string };

    const unauthenticated = await request.post(`${apiBaseURL}/bookings/claim-guest`, {
      data: { clientRequestId: secret },
    });
    expect([401, 403]).toContain(unauthenticated.status());

    const otherRegister = await request.post(`${apiBaseURL}/auth/register`, {
      data: {
        firstName: "Another",
        lastName: "Passenger",
        email: `guest-other-${randomUUID()}@example.com`,
        phone: otherPhone,
        password: "TestPassword123!",
        whatsappOptIn: false,
      },
    });
    expect(otherRegister.status(), await otherRegister.text()).toBe(201);
    const otherToken = ((await otherRegister.json()) as { accessToken: string }).accessToken;
    const rejected = await request.post(`${apiBaseURL}/bookings/claim-guest`, {
      headers: { Authorization: `Bearer ${otherToken}` },
      data: { clientRequestId: secret },
    });
    expect(rejected.status(), await rejected.text()).toBe(201);
    expect((await rejected.json()).linked).toBe(false);
    expect((await prisma.trip.findUniqueOrThrow({ where: { clientRequestId: secret } })).passengerId).toBeNull();

    const register = await request.post(`${apiBaseURL}/auth/register`, {
      data: {
        firstName: "True",
        lastName: "Passenger",
        email: `guest-real-${randomUUID()}@example.com`,
        phone: guestPhone,
        password: "TestPassword123!",
        whatsappOptIn: false,
      },
    });
    expect(register.status(), await register.text()).toBe(201);
    const session = (await register.json()) as { accessToken: string; user: { id: string } };

    // Matching a phone does not silently expose old guest bookings.
    const beforeClaim = await request.get(`${apiBaseURL}/bookings/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(beforeClaim.ok()).toBeTruthy();
    expect((await beforeClaim.json()) as Array<{ bookingReference: string }>).not.toContainEqual(
      expect.objectContaining({ bookingReference }),
    );

    const claim = await request.post(`${apiBaseURL}/bookings/claim-guest`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { clientRequestId: secret },
    });
    expect(claim.status(), await claim.text()).toBe(201);
    const result = (await claim.json()) as { linked: boolean; bookingId: string | null };
    expect(result.linked).toBe(true);
    expect(result.bookingId).toBeTruthy();

    // Duplicate claims are safe and cannot transfer ownership.
    const retry = await request.post(`${apiBaseURL}/bookings/claim-guest`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { clientRequestId: secret },
    });
    expect(retry.status(), await retry.text()).toBe(201);
    expect((await retry.json()).linked).toBe(true);

    const mine = await request.get(`${apiBaseURL}/bookings/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(mine.ok()).toBeTruthy();
    const ownTrips = (await mine.json()) as Array<{ id: string; bookingReference: string }>;
    expect(ownTrips.some((booking) => booking.id === result.bookingId && booking.bookingReference === bookingReference)).toBe(true);
    expect((await prisma.trip.findUniqueOrThrow({ where: { clientRequestId: secret } })).passengerId).toBe(session.user.id);
  });

  test("shows and retries same-device guest booking claims from My Bookings", async ({ request, page }) => {
    const number = phone();
    const secret = randomUUID();
    const guest = await bookAsGuest(request, number, secret);
    expect(guest.status(), await guest.text()).toBe(201);
    const { bookingReference } = (await guest.json()) as { bookingReference: string };
    const registration = await request.post(`${apiBaseURL}/auth/register`, {
      data: {
        firstName: "Recovery",
        lastName: "Passenger",
        email: `guest-recovery-${randomUUID()}@example.com`,
        phone: number,
        password: "TestPassword123!",
        whatsappOptIn: false,
      },
    });
    expect(registration.status(), await registration.text()).toBe(201);
    const session = (await registration.json()) as {
      accessToken: string;
      refreshToken?: string;
      user: { id: string; roles: string[] };
    };
    await page.addInitScript(({ secret, bookingReference, session }) => {
      localStorage.setItem("ride_access_token", session.accessToken);
      if (session.refreshToken) localStorage.setItem("ride_refresh_token", session.refreshToken);
      localStorage.setItem("ride_user", JSON.stringify(session.user));
      localStorage.setItem("tareeq_guest_booking_claims_v1", JSON.stringify([
        { clientRequestId: secret, bookingReference, savedAt: Date.now() },
      ]));
    }, { secret, bookingReference, session });

    await page.goto("/rider/bookings");
    await page.getByText("لديك حجز سابق دون حساب؟ اربطه بحسابك").click();
    await expect(page.getByText(/وجدنا 1 حجز ضيف محفوظًا في هذا المتصفح/)).toBeVisible();
    await page.getByRole("button", { name: "ربط حجوزات هذا الجهاز" }).click();
    await expect(page.getByText("تم ربط 1 حجز بحسابك. يمكنك الآن متابعة تفاصيل الرحلات.")).toBeVisible();
    await expect(page.getByText(bookingReference).first()).toBeVisible();
    const trip = await prisma.trip.findUniqueOrThrow({ where: { clientRequestId: secret } });
    expect(trip.passengerId).toBe(session.user.id);
  });

  test("automatically links a stored guest proof when the passenger registers in the same browser", async ({ request, page }) => {
    const number = phone();
    const secret = randomUUID();
    const guest = await bookAsGuest(request, number, secret);
    expect(guest.status(), await guest.text()).toBe(201);
    const { bookingReference } = (await guest.json()) as { bookingReference: string };
    await page.addInitScript(({ secret, bookingReference }) => {
      localStorage.setItem("tareeq_guest_booking_claims_v1", JSON.stringify([
        { clientRequestId: secret, bookingReference, savedAt: Date.now() },
      ]));
    }, { secret, bookingReference });

    await page.goto("/register");
    await page.getByLabel("الاسم الأول").fill("Same");
    await page.getByLabel("الاسم الأخير").fill("Browser");
    await page.getByLabel("البريد الإلكتروني").fill(`same-browser-${randomUUID()}@example.com`);
    await page.locator('input[name="phone"]').fill(number);
    await page.locator('input[autocomplete="new-password"]').nth(0).fill("TestPassword123!");
    await page.locator('input[autocomplete="new-password"]').nth(1).fill("TestPassword123!");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();

    await expect.poll(async () => {
      const trip = await prisma.trip.findUnique({ where: { clientRequestId: secret } });
      return trip?.accountLinkStatus;
    }, { timeout: 15000 }).toBe("LINKED");
    await page.goto("/rider/bookings");
    await expect(page.getByText(bookingReference).first()).toBeVisible();
  });

});
