"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RideMapClient } from "@/components/ride-map-client";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useDriverData } from "@/hooks/use-driver-data";
import { apiFetch } from "@/lib/api";
import {
  DRIVER_ASSIGNMENT_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  TRIP_STATUS_LABELS,
} from "@/lib/types";

const operationalStatuses = [
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
] as const;

export default function DriverPage() {
  const {
    profile,
    schedule,
    runs,
    error,
    isLoading,
    isRealtimeConnected,
    reload,
  } = useDriverData();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const activeTrip = useMemo(
    () =>
      schedule.find(
        (trip) =>
          operationalStatuses.includes(trip.status as (typeof operationalStatuses)[number]) &&
          trip.driverAssignmentStatus === "ACCEPTED",
      ) ?? null,
    [schedule],
  );
  const pendingAssignments = schedule.filter((trip) => trip.driverAssignmentStatus === "PENDING");
  const activeRuns = runs.filter((run) => !["COMPLETED", "CANCELLED"].includes(run.status));

  async function goOnline() {
    setWorking(true);
    setMessage("");
    setLocalError("");
    try {
      await apiFetch("/drivers/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ availability: "ONLINE" }),
      });
      setMessage("أصبحت متصلًا ومتاحًا لتعيين الرحلات.");
      await reload();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "تعذر تحديث حالة الاتصال.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق"
          title="لوحة السائق"
          subtitle="ملخص واضح للمهمة الحالية والطلبات والرحلات التشغيلية."
          actions={<Link className="button primary" href="/driver/bookings"><Icon name="briefcase" size={18} /> فتح المهام</Link>}
        />

        <div className="rider-dashboard-toolbar">
          <div className={`rider-live-status ${isRealtimeConnected ? "is-online" : "is-offline"}`}>
            <span />
            <div><strong>{isRealtimeConnected ? "التحديث المباشر فعّال" : "التحديث الاحتياطي فعّال"}</strong><small>تظهر التعيينات وتغييرات الرحلات تلقائيًا</small></div>
          </div>
          <button className="button compact-button" type="button" onClick={() => void reload()}><Icon name="wifi" size={17} /> تحديث</button>
        </div>

        {error || localError ? <div className="notice error">{localError || error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        <section className="rider-stat-grid">
          <article className="rider-stat-card tone-primary"><span className="rider-stat-icon"><Icon name="briefcase" size={21} /></span><div><small>بانتظار ردك</small><strong>{pendingAssignments.length}</strong></div></article>
          <article className="rider-stat-card tone-info"><span className="rider-stat-icon"><Icon name="route" size={21} /></span><div><small>رحلات تشغيلية</small><strong>{activeRuns.length}</strong></div></article>
          <article className="rider-stat-card tone-success"><span className="rider-stat-icon"><Icon name="wifi" size={21} /></span><div><small>حالة التوفر</small><strong className="driver-stat-text">{profile?.availability ?? "..."}</strong></div></article>
          <article className="rider-stat-card tone-neutral"><span className="rider-stat-icon"><Icon name="drivers" size={21} /></span><div><small>التقييم</small><strong>{profile?.rating ?? "..."}</strong></div></article>
        </section>

        {profile?.availability === "OFFLINE" ? (
          <section className="panel driver-online-callout">
            <div><span className="eyebrow">حالة التوفر</span><h2>أنت غير متصل حاليًا</h2><p className="subtitle">اتصل لتظهر لمركز العمليات كسائق متاح للتعيين.</p></div>
            <button className="button primary" type="button" disabled={working} onClick={() => void goOnline()}>{working ? "جارٍ التحديث..." : "أصبح متصلًا"}</button>
          </section>
        ) : null}

        {activeTrip ? (
          <section className="panel map-preview-panel">
            <div className="section-heading">
              <div><span className="eyebrow">المهمة الحالية</span><h2>{activeTrip.pickupAddress} ← {activeTrip.dropoffAddress}</h2><p className="subtitle">{activeTrip.bookingReference}</p></div>
              <span className="status">{TRIP_STATUS_LABELS[activeTrip.status]}</span>
            </div>
            <RideMapClient
              pickup={{ latitude: activeTrip.pickupLatitude, longitude: activeTrip.pickupLongitude, label: activeTrip.pickupAddress }}
              dropoff={{ latitude: activeTrip.dropoffLatitude, longitude: activeTrip.dropoffLongitude, label: activeTrip.dropoffAddress }}
              height={350}
            />
            <div className="actions"><Link className="button primary" href="/driver/bookings">متابعة تنفيذ المهمة</Link></div>
          </section>
        ) : null}

        <div className="two-column-layout driver-dashboard-columns">
          <section className="panel">
            <div className="section-heading"><div><span className="eyebrow">الحجوزات الخاصة</span><h2>أقرب المهام</h2></div><Link className="text-button" href="/driver/bookings">عرض الكل</Link></div>
            {isLoading ? <div className="empty-state">جارٍ التحميل...</div> : schedule.length === 0 ? <div className="empty-state">لا توجد مهام مجدولة.</div> : (
              <div className="schedule-list">{schedule.slice(0, 4).map((trip) => <div className="schedule-row" key={trip.id}><div><strong>{trip.bookingReference || "رحلة"}</strong><small>{trip.travelDate ? new Date(trip.travelDate).toLocaleDateString("ar") : "غير مجدولة"}</small></div><span>{trip.driverAssignmentStatus ? DRIVER_ASSIGNMENT_LABELS[trip.driverAssignmentStatus] : TRIP_STATUS_LABELS[trip.status]}</span></div>)}</div>
            )}
          </section>

          <section className="panel">
            <div className="section-heading"><div><span className="eyebrow">التشغيل</span><h2>الرحلات التشغيلية</h2></div><Link className="text-button" href="/driver/runs">عرض الكل</Link></div>
            {isLoading ? <div className="empty-state">جارٍ التحميل...</div> : runs.length === 0 ? <div className="empty-state">لا توجد رحلات تشغيلية.</div> : (
              <div className="schedule-list">{runs.slice(0, 4).map((run) => <div className="schedule-row" key={run.id}><div><strong>{run.runReference}</strong><small>{new Date(run.travelDate).toLocaleString("ar")}</small></div><span>{SERVICE_RUN_STATUS_LABELS[run.status]}</span></div>)}</div>
            )}
          </section>
        </div>
      </Shell>
    </ProtectedRoute>
  );
}
