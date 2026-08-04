"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useDriverData } from "@/hooks/use-driver-data";
import {
  BOOKING_TYPE_LABELS,
  SERVICE_RUN_STATUS_LABELS,
} from "@/lib/types";

export default function DriverRunsPage() {
  const { runs, error, isLoading, reload } = useDriverData();

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / التشغيل"
          title="الرحلات التشغيلية"
          subtitle="كل رحلة تشغيلية في بطاقة مستقلة، وتفاصيل الركاب والتنفيذ داخل صفحتها."
          actions={<Link className="button" href="/driver"><Icon name="arrow-right" size={17} /> لوحة السائق</Link>}
        />
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الجدول التشغيلي</span><h2>الرحلات المسندة إليك</h2></div><button className="button" type="button" onClick={() => void reload()}>تحديث</button></div>
          {isLoading ? <div className="empty-state">جارٍ تحميل الرحلات...</div> : runs.length === 0 ? <div className="empty-state">لا توجد رحلات تشغيلية مسندة إليك.</div> : (
            <div className="schedule-card-grid run-grid">
              {runs.map((run) => (
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
