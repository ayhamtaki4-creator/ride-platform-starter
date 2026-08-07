"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useDriverData } from "@/hooks/use-driver-data";
import { isRunEnded, isTripEnded, sortRunsNewestFirst, sortTripsNewestFirst } from "@/lib/completed-bookings";
import { BOOKING_TYPE_LABELS, SERVICE_RUN_STATUS_LABELS, TRIP_STATUS_LABELS } from "@/lib/types";

export default function DriverCompletedBookingsPage() {
  const { schedule, runs, error, isLoading, reload } = useDriverData();
  const endedTrips = sortTripsNewestFirst(schedule.filter(isTripEnded));
  const endedRuns = sortRunsNewestFirst(runs.filter(isRunEnded));

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / السجل"
          title="الحجوزات المنتهية"
          subtitle="كل الحجوزات والرحلات التشغيلية المكتملة أو الملغاة، مع الأحدث أولًا."
          actions={<Link className="button" href="/driver/bookings"><Icon name="arrow-right" size={17} /> المهام الحالية</Link>}
        />
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الحجوزات</span><h2>الحجوزات المنتهية</h2><p className="subtitle">{endedTrips.length} حجز</p></div><button className="button" type="button" onClick={() => void reload()}>تحديث</button></div>
          {isLoading ? <div className="empty-state">جارٍ تحميل السجل...</div> : endedTrips.length === 0 ? <div className="empty-state">لا توجد حجوزات منتهية حتى الآن.</div> : (
            <div className="schedule-card-grid driver-assignment-grid">
              {endedTrips.map((trip) => (
                <article className="booking-card" key={trip.id}>
                  <div className="booking-card-head"><div><strong>{trip.bookingReference || "رحلة"}</strong><small>{trip.travelDate ? new Date(trip.travelDate).toLocaleDateString("ar") : "—"}</small></div><span className="status">{TRIP_STATUS_LABELS[trip.status]}</span></div>
                  <div className="booking-meta"><span>{trip.route?.nameAr || `${trip.pickupAddress} ← ${trip.dropoffAddress}`}</span><span>{trip.contactName || trip.passenger?.firstName || "—"}</span><span>{trip.contactPhone || "—"}</span></div>
                  <div className="detail-list compact-detail-list"><div><span>الالتقاط</span><strong>{trip.pickupAddress}</strong></div><div><span>الوصول</span><strong>{trip.dropoffAddress}</strong></div></div>
                  {trip.serviceRun ? <Link className="button" href={`/driver/runs/${trip.serviceRun.id}`}>فتح الرحلة التشغيلية</Link> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الرحلات التشغيلية</span><h2>الرحلات المنتهية</h2><p className="subtitle">{endedRuns.length} رحلة</p></div></div>
          {isLoading ? <div className="empty-state">جارٍ تحميل السجل...</div> : endedRuns.length === 0 ? <div className="empty-state">لا توجد رحلات تشغيلية منتهية.</div> : (
            <div className="schedule-card-grid run-grid">
              {endedRuns.map((run) => (
                <article className="booking-card" key={run.id}>
                  <div className="booking-card-head"><div><strong>{run.runReference}</strong><small>{new Date(run.travelDate).toLocaleString("ar")}</small></div><span className="status">{SERVICE_RUN_STATUS_LABELS[run.status]}</span></div>
                  <div className="booking-meta"><span>{run.route?.nameAr || "مسار تشغيلي"}</span><span>{BOOKING_TYPE_LABELS[run.bookingType]}</span><span>{run.report.bookingCount} حجوزات</span></div>
                  <Link className="button" href={`/driver/runs/${run.id}`}>فتح تفاصيل الرحلة</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
