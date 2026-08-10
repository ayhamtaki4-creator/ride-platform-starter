"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch } from "@/lib/api";
import { sortRunsNewestFirst, sortTripsNewestFirst } from "@/lib/completed-bookings";
import {
  PAYMENT_RECEIVER_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentAwareTrip,
} from "@/lib/payments";
import {
  BOOKING_TYPE_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  ServiceRun,
  TRIP_STATUS_LABELS,
} from "@/lib/types";

export default function AdminCompletedBookingsPage() {
  const [bookings, setBookings] = useState<PaymentAwareTrip[]>([]);
  const [runs, setRuns] = useState<ServiceRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bookingRows, runRows] = await Promise.all([
        apiFetch<PaymentAwareTrip[]>("/admin/bookings?history=true"),
        apiFetch<ServiceRun[]>("/admin/runs?history=true"),
      ]);
      setBookings(sortTripsNewestFirst(bookingRows) as PaymentAwareTrip[]);
      setRuns(sortRunsNewestFirst(runRows));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الحجوزات المنتهية.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / السجل"
          title="الحجوزات المنتهية"
          subtitle="الحجوزات والرحلات التشغيلية المكتملة أو الملغاة، مع حالة التحصيل النقدي لكل حجز."
          actions={<div className="actions"><Link className="button" href="/admin/bookings">الحجوزات الحالية</Link><Link className="button" href="/admin/runs">الرحلات الحالية</Link></div>}
        />

        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الحجوزات</span><h2>الحجوزات المنتهية</h2><p className="subtitle">{bookings.length} حجز</p></div><button className="button" type="button" onClick={() => void load()}>تحديث</button></div>
          {loading ? <div className="empty-state">جارٍ تحميل السجل...</div> : bookings.length === 0 ? <div className="empty-state">لا توجد حجوزات منتهية.</div> : (
            <div className="booking-list admin-booking-list">
              {bookings.map((booking) => (
                <article className="booking-card" key={booking.id}>
                  <div className="booking-card-head"><div><strong>{booking.bookingReference}</strong><small>{booking.contactName} · {booking.contactPhone}</small></div><StatusPill status={booking.status} label={TRIP_STATUS_LABELS[booking.status]} /></div>
                  <div className="booking-meta">
                    <span>{booking.route?.nameAr || `${booking.pickupAddress} ← ${booking.dropoffAddress}`}</span>
                    <span>{booking.travelDate ? new Date(booking.travelDate).toLocaleDateString("ar") : "—"}</span>
                    <span>{Number(booking.finalFare ?? booking.estimatedFare).toLocaleString("ar")} {booking.currency}</span>
                    <span>{PAYMENT_STATUS_LABELS[booking.paymentStatus]} · {Number(booking.amountPaid).toLocaleString("ar")} {booking.currency}</span>
                    {booking.paymentReceiver ? <span>استلم: {PAYMENT_RECEIVER_LABELS[booking.paymentReceiver]}</span> : null}
                  </div>
                  <div className="detail-list compact-detail-list"><div><span>الالتقاط</span><strong>{booking.pickupAddress}</strong></div><div><span>الوصول</span><strong>{booking.dropoffAddress}</strong></div></div>
                  <div className="actions"><Link className="button" href={`/admin/bookings/${booking.id}`}>التفاصيل والتحصيل</Link></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الرحلات التشغيلية</span><h2>الرحلات المنتهية</h2><p className="subtitle">{runs.length} رحلة</p></div></div>
          {loading ? <div className="empty-state">جارٍ تحميل السجل...</div> : runs.length === 0 ? <div className="empty-state">لا توجد رحلات تشغيلية منتهية.</div> : (
            <div className="schedule-card-grid run-grid">
              {runs.map((run) => (
                <article className="booking-card" key={run.id}>
                  <div className="booking-card-head"><div><strong>{run.runReference}</strong><small>{new Date(run.travelDate).toLocaleString("ar")}</small></div><StatusPill status={run.status} label={SERVICE_RUN_STATUS_LABELS[run.status]} /></div>
                  <div className="booking-meta"><span>{run.route?.nameAr || "مسار تشغيلي"}</span><span>{BOOKING_TYPE_LABELS[run.bookingType]}</span><span>{run.driver?.firstName} {run.driver?.lastName}</span><span>{run.report.bookingCount} حجوزات</span></div>
                  <Link className="button" href={`/admin/runs/${run.id}`}>تفاصيل الرحلة</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
