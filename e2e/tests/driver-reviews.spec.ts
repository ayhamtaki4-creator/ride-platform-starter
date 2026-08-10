import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { accounts, apiBaseURL } from "../helpers/accounts";
import { apiLogin, bearer } from "../helpers/auth";

type Route = {
  id: string;
  origin: { nameAr: string };
  destination: { nameAr: string };
};

type CreatedBooking = { id: string };

type ReviewResponse = {
  id: string;
  tripId: string;
  driverId: string;
  rating: number;
  comment?: string | null;
  driverRating: number;
  reviewCount: number;
};

function futureDate(days = 55) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createBooking(
  request: APIRequestContext,
  riderToken: string,
  route: Route,
  suffix: string,
) {
  const response = await request.post(`${apiBaseURL}/bookings`, {
    headers: bearer(riderToken),
    data: {
      clientRequestId: randomUUID(),
      routeId: route.id,
      bookingType: "PRIVATE_CAR",
      vehicleClass: "SMALL",
      travelDate: futureDate(),
      flightArrivalTime: "12:30",
      flightNumber: `REV-${suffix}`,
      passengerCount: 1,
      luggageCount: 1,
      pickupAddress: route.origin.nameAr,
      dropoffAddress: route.destination.nameAr,
      passengerName: `مسافر تقييم ${suffix}`,
      passengerPhone: "+963944008812",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as CreatedBooking;
}

test.describe.serial("Driver reviews", () => {
  test("allows one review per completed trip and recalculates the driver average", async ({ request }) => {
    const riderToken = await apiLogin(request, "rider");
    const driverToken = await apiLogin(request, "driver");

    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Route[];
    expect(routes.length).toBeGreaterThan(0);
    const route = routes[0];

    const prisma = new PrismaClient();
    const driver = await prisma.user.findUniqueOrThrow({
      where: { email: accounts.driver.email },
      select: { id: true },
    });

    const createdTripIds: string[] = [];
    try {
      await prisma.driverReview.deleteMany({ where: { driverId: driver.id } });
      await prisma.driverProfile.update({ where: { userId: driver.id }, data: { rating: 5 } });

      const first = await createBooking(request, riderToken, route, "A");
      createdTripIds.push(first.id);
      await prisma.trip.update({
        where: { id: first.id },
        data: {
          driverId: driver.id,
          status: "COMPLETED",
          bookingReviewStatus: "CONFIRMED",
          driverAssignmentStatus: "ACCEPTED",
          completedAt: new Date(),
        },
      });

      const firstReviewResponse = await request.post(`${apiBaseURL}/bookings/${first.id}/driver-review`, {
        headers: bearer(riderToken),
        data: { rating: 5, comment: "السائق ملتزم بالموعد والتعامل ممتاز." },
      });
      expect(firstReviewResponse.status(), await firstReviewResponse.text()).toBe(201);
      const firstReview = (await firstReviewResponse.json()) as ReviewResponse;
      expect(firstReview.rating).toBe(5);
      expect(firstReview.driverRating).toBe(5);
      expect(firstReview.reviewCount).toBe(1);

      const duplicate = await request.post(`${apiBaseURL}/bookings/${first.id}/driver-review`, {
        headers: bearer(riderToken),
        data: { rating: 4 },
      });
      expect(duplicate.status()).toBe(409);

      const second = await createBooking(request, riderToken, route, "B");
      createdTripIds.push(second.id);
      await prisma.trip.update({
        where: { id: second.id },
        data: {
          driverId: driver.id,
          status: "COMPLETED",
          bookingReviewStatus: "CONFIRMED",
          driverAssignmentStatus: "ACCEPTED",
          completedAt: new Date(),
        },
      });

      const secondReviewResponse = await request.post(`${apiBaseURL}/bookings/${second.id}/driver-review`, {
        headers: bearer(riderToken),
        data: { rating: 2, comment: "الرحلة مكتملة لكن هناك مجال لتحسين الالتزام بالوقت." },
      });
      expect(secondReviewResponse.status(), await secondReviewResponse.text()).toBe(201);
      const secondReview = (await secondReviewResponse.json()) as ReviewResponse;
      expect(secondReview.driverRating).toBe(3.5);
      expect(secondReview.reviewCount).toBe(2);

      const pending = await createBooking(request, riderToken, route, "PENDING");
      createdTripIds.push(pending.id);
      await prisma.trip.update({
        where: { id: pending.id },
        data: { driverId: driver.id },
      });
      const tooEarly = await request.post(`${apiBaseURL}/bookings/${pending.id}/driver-review`, {
        headers: bearer(riderToken),
        data: { rating: 5 },
      });
      expect(tooEarly.status()).toBe(409);

      const invalid = await request.post(`${apiBaseURL}/bookings/${pending.id}/driver-review`, {
        headers: bearer(riderToken),
        data: { rating: 6 },
      });
      expect(invalid.status()).toBe(400);

      const passengerReviewsResponse = await request.get(`${apiBaseURL}/bookings/me/driver-reviews`, {
        headers: bearer(riderToken),
      });
      expect(passengerReviewsResponse.ok()).toBeTruthy();
      const passengerReviews = (await passengerReviewsResponse.json()) as ReviewResponse[];
      expect(passengerReviews.filter((review) => [first.id, second.id].includes(review.tripId))).toHaveLength(2);

      const driverReviewsResponse = await request.get(`${apiBaseURL}/drivers/me/reviews`, {
        headers: bearer(driverToken),
      });
      expect(driverReviewsResponse.ok()).toBeTruthy();
      const driverReviews = (await driverReviewsResponse.json()) as {
        rating: number;
        reviewCount: number;
        reviews: Array<{ tripId: string; rating: number; comment?: string | null }>;
      };
      expect(driverReviews.rating).toBe(3.5);
      expect(driverReviews.reviewCount).toBe(2);
      expect(driverReviews.reviews.some((review) => review.tripId === first.id && review.rating === 5)).toBeTruthy();
      expect(driverReviews.reviews.some((review) => review.tripId === second.id && review.rating === 2)).toBeTruthy();

      const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: driver.id } });
      expect(profile.rating).toBe(3.5);

      const auditCount = await prisma.auditLog.count({
        where: { action: "driver.review.create", entityType: "DriverReview" },
      });
      expect(auditCount).toBeGreaterThanOrEqual(2);

      const notificationCount = await prisma.notification.count({
        where: { userId: driver.id, type: "DRIVER_REVIEW_RECEIVED" },
      });
      expect(notificationCount).toBeGreaterThanOrEqual(2);
    } finally {
      await prisma.driverReview.deleteMany({ where: { driverId: driver.id } });
      await prisma.driverProfile.update({ where: { userId: driver.id }, data: { rating: 5 } });
      if (createdTripIds.length) {
        await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
      }
      await prisma.$disconnect();
    }
  });
});
