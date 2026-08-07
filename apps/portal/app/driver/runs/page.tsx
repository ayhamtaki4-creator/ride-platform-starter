"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useDriverData } from "@/hooks/use-driver-data";
import { isRunEnded } from "@/lib/completed-bookings";
import {
  BOOKING_TYPE_LABELS,
  SERVICE_RUN_STATUS_LABELS,
} from "@/lib/types";

export default function DriverRunsPage() {
  const { runs, error, isLoading, reload } = useDriverData();
  const activeRuns = useMemo(
    () => [...runs]
      .filter((run) => !isRunEnded(run))
      .sort((a, b) => new Date(b.travelDate).getTime() - new Date(a.travelDate).getTime()),
    [runs],
  );

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / التشغيل"
          title="الرحلات التشغيلية الحالية"
          subtitle="الرحلات المنتهية أو الملغاة محفوظة في صفحة الحجوزات المنتهية."
          actions={<div className="actions"><Link className="button" href="/driver/completed-bookings"><Icon name="check" size={17} /> الحجوزات المنتهية</Link><Link className="button" href="/driver"><Icon name="arrow-right" size={17} /> لوحة السائق</Link></div>}
        />
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الجدول التشغيلي</span><h2>الرحلات المسندة إليك</h2></div><button className="button" type="button" onClick={() => void reload()}>تحديث</button></div>
          {isLoading ? <div className="empty-state">جارٍ تحميل الرحلات...</div> : activeRuns.length === 0 ? <div className="empty-state">لا توجد رحلات تشغيلية حالية.</div> : (
            <div className="schedule-card-grid run-grid">
              {activeRuns.map((run) => (
                <article className="booking-card" key={run.id}>
                  <div className="booking-card-head"><div><strong>{run.runReference}</strong><small>{new Date(run.travelDate).toLocaleString("ar")}</small></div><span className="status">{SERVICE_RUN_STATUS_LABELS[run.status]}</span></div>
                  <div className="booking-meta"><span>{run.route?.nameAr || "مسار تشغيلي"}</span><span>{BOOKING_TYPE_LABELS[run.bookingType]}</span><span>{run.report.bookingCount} حجوزات</span><span>{run.reservedSeats}/{run.seatCapacity} من السعة</span></div>
                  {run.driverRejectionReason ? <div className="notice error">{run.driverRejectionReason}</div> : null}
                  <Link className="button primary" href={`/driver/runs/${run.id}`}>فتح الرحلة وقائمة الركاب</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
