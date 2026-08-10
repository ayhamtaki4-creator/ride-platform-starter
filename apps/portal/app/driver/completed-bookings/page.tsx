"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useDriverData } from "@/hooks/use-driver-data";
import { apiFetch } from "@/lib/api";
import { isRunEnded, isTripEnded, sortRunsNewestFirst, sortTripsNewestFirst } from "@/lib/completed-bookings";
import {
  bookingTotal,
  PAYMENT_RECEIVER_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentAwareTrip,
} from "@/lib/payments";
import { BOOKING_TYPE_LABELS, SERVICE_RUN_STATUS_LABELS, TRIP_STATUS_LABELS } from "@/lib/types";

export default function DriverCompletedBookingsPage() {
  const { schedule, runs, error, isLoading, reload } = useDriverData();
  const endedTrips = sortTripsNewestFirst(schedule.filter(isTripEnded)) as PaymentAwareTrip[];
  const endedRuns = sortRunsNewestFirst(runs.filter(isRunEnded));
  const [workingPayment, setWorkingPayment] = useState("");
  const [localError, setLocalError] = useState("");
  const [message, setMessage] = useState("");

  async function confirmCashReceived(tripId: string) {
    setWorkingPayment(tripId);
    setLocalError("");
    setMessage("");
    try {
      await apiFetch(`/drivers/me/bookings/${tripId}/cash-payment`, {
        method: "POST",
      });
      setMessage("تم تسجيل استلام المبلغ النقدي وإبلاغ الإدارة.");
      await reload();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "تعذر تسجيل استلام المبلغ.");
    } finally {
      setWorkingPayment("");
    }
  }

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / السجل"
          title="الحجوزات المنتهية"
          subtitle="كل الحجوزات والرحلات التشغيلية المكتملة أو الملغاة، مع حالة استلام المبلغ النقدي."
          actions={<Link className="button" href="/driver/bookings"><Icon name="arrow-right" size={17} /> المهام الحالية</Link>}
        />
        {error || localError ? <div className="notice error">{localError || error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الحجوزات</span><h2>الحجوزات المنتهية</h2><p className="subtitle">{endedTrips.length} حجز</p></div><button className="button" type="button" onClick={() => void reload()}>تحديث</button></div>
          {isLoading ? <div className="empty-state">جارٍ تحميل السجل...</div> : endedTrips.length === 0 ? <div className="empty-state">لا توجد حجوزات منتهية حتى الآن.</div> : (
            <div className="schedule-card-grid driver-assignment-grid">
              {endedTrips.map((trip) => (
                <article className="booking-card" key={trip.id}>
                  <div className="booking-card-head"><div><strong>{trip.bookingReference || "رحلة"}</strong><small>{trip.travelDate ? new Date(trip.travelDate).toLocaleDateString("ar") : "—"}</small></div><span className="status">{TRIP_STATUS_LABELS[trip.status]}</span></div>
                  <div className="booking-meta"><span>{trip.route?.nameAr || `${trip.pickupAddress} ← ${trip.dropoffAddress}`}</span><span>{trip.contactName || trip.passenger?.firstName || "—"}</span><span>{trip.contactPhone || "—"}</span></div>
                  <div className="detail-list compact-detail-list">
                    <div><span>الالتقاط</span><strong>{trip.pickupAddress}</strong></div>
                    <div><span>الوصول</span><strong>{trip.dropoffAddress}</strong></div>
                    <div><span>قيمة الحجز</span><strong>{bookingTotal(trip).toLocaleString("ar")} {trip.currency}</strong></div>
                    <div><span>الدفع</span><strong>{PAYMENT_STATUS_LABELS[trip.paymentStatus]}</strong></div>
                    {trip.paymentReceiver ? <div><span>مستلم النقد</span><strong>{PAYMENT_RECEIVER_LABELS[trip.paymentReceiver]}</strong></div> : null}
                  </div>
                  {trip.status === "COMPLETED" && trip.paymentStatus === "UNPAID" ? (
                    <button className="button primary" type="button" disabled={Boolean(workingPayment)} onClick={() => void confirmCashReceived(trip.id)}>
                      {workingPayment === trip.id ? "جارٍ التسجيل..." : "تأكيد استلام المبلغ نقدًا"}
                    </button>
                  ) : null}
                  {trip.status === "COMPLETED" && trip.paymentStatus === "PARTIALLY_PAID" ? (
                    <div className="notice">يوجد مبلغ جزئي مسجل لهذا الحجز. راجع الإدارة لإكمال أو تصحيح التحصيل.</div>
                  ) : null}
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
