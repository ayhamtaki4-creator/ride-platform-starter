"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RiderBookingCard } from "@/components/rider/booking-card";
import { RiderBookingSkeleton } from "@/components/rider/rider-loading";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useRiderBookings } from "@/hooks/use-rider-bookings";
import { isBookingCancelled, isBookingCompleted, sortBookingsNewest } from "@/lib/rider-bookings";

export default function RiderCompletedBookingsPage() {
  const { bookings, error, isLoading, isRefreshing, reload } = useRiderBookings();
  const endedBookings = sortBookingsNewest(
    bookings.filter((booking) => isBookingCompleted(booking) || isBookingCancelled(booking)),
  );

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر / الأرشيف"
          title="الحجوزات المنتهية"
          subtitle="الحجوزات المكتملة أو الملغاة محفوظة هنا، والأحدث يظهر أولًا."
          actions={<Link className="button" href="/rider/bookings"><Icon name="arrow-right" size={17} /> الحجوزات الحالية</Link>}
        />

        <section className="panel rider-bookings-panel">
          <div className="section-heading">
            <div><span className="eyebrow">السجل</span><h2>الحجوزات والرحلات المنتهية</h2><p className="subtitle">إجمالي {endedBookings.length} حجز منتهٍ.</p></div>
            <button className="button compact-button" type="button" onClick={reload} disabled={isRefreshing}>{isRefreshing ? "جارٍ التحديث..." : "تحديث"}</button>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
          {isLoading ? <RiderBookingSkeleton count={4} /> : endedBookings.length ? (
            <div className="rider-booking-list-v2">
              {endedBookings.map((booking) => <RiderBookingCard booking={booking} key={booking.id} />)}
            </div>
          ) : <div className="empty-state">لا توجد حجوزات منتهية حتى الآن.</div>}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
