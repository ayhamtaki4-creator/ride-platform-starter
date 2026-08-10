"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RiderBookingCard } from "@/components/rider/booking-card";
import {
  DriverReviewPanel,
  PassengerDriverReview,
} from "@/components/rider/driver-review-panel";
import { RiderBookingSkeleton } from "@/components/rider/rider-loading";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useRiderBookings } from "@/hooks/use-rider-bookings";
import { apiFetch } from "@/lib/api";
import { isBookingCancelled, isBookingCompleted, sortBookingsNewest } from "@/lib/rider-bookings";

export default function RiderCompletedBookingsPage() {
  const { bookings, error, isLoading, isRefreshing, reload } = useRiderBookings();
  const [reviews, setReviews] = useState<Record<string, PassengerDriverReview>>({});
  const [reviewError, setReviewError] = useState("");

  const loadReviews = useCallback(async () => {
    try {
      const rows = await apiFetch<PassengerDriverReview[]>("/bookings/me/driver-reviews");
      setReviews(Object.fromEntries(rows.map((review) => [review.tripId, review])));
      setReviewError("");
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "تعذر تحميل تقييمات السائقين.");
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const endedBookings = sortBookingsNewest(
    bookings.filter((booking) => isBookingCompleted(booking) || isBookingCancelled(booking)),
  );

  async function refreshAll() {
    await Promise.all([reload(), loadReviews()]);
  }

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر / الأرشيف"
          title="الحجوزات المنتهية"
          subtitle="الحجوزات المكتملة أو الملغاة محفوظة هنا، ويمكن تقييم السائق بعد اكتمال الرحلة."
          actions={<Link className="button" href="/rider/bookings"><Icon name="arrow-right" size={17} /> الحجوزات الحالية</Link>}
        />

        <section className="panel rider-bookings-panel">
          <div className="section-heading">
            <div><span className="eyebrow">السجل</span><h2>الحجوزات والرحلات المنتهية</h2><p className="subtitle">إجمالي {endedBookings.length} حجز منتهٍ.</p></div>
            <button className="button compact-button" type="button" onClick={() => void refreshAll()} disabled={isRefreshing}>{isRefreshing ? "جارٍ التحديث..." : "تحديث"}</button>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
          {reviewError ? <div className="notice error">{reviewError}</div> : null}
          {isLoading ? <RiderBookingSkeleton count={4} /> : endedBookings.length ? (
            <div className="rider-booking-list-v2">
              {endedBookings.map((booking) => (
                <div key={booking.id}>
                  <RiderBookingCard booking={booking} />
                  <DriverReviewPanel
                    booking={booking}
                    review={reviews[booking.id] ?? null}
                    onCreated={(review) => setReviews((current) => ({ ...current, [review.tripId]: review }))}
                  />
                </div>
              ))}
            </div>
          ) : <div className="empty-state">لا توجد حجوزات منتهية حتى الآن.</div>}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
