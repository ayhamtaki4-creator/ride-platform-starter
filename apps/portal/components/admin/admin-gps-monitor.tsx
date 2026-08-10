"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { trackingHealth, type TrackingHealth } from "@/lib/tracking-health";
import type { TripLiveLocation } from "@/lib/tracking";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/types";

type ActiveTrackingStatus = Extract<
  TripStatus,
  "DRIVER_ASSIGNED" | "DRIVER_ARRIVING" | "DRIVER_ARRIVED" | "IN_PROGRESS"
>;

type ActiveTrackingTrip = {
  tripId: string;
  bookingReference: string | null;
  status: ActiveTrackingStatus;
  driverId: string;
  driverFirstName: string;
  driverLastName: string;
  liveLocation: TripLiveLocation | null;
};

const TRACKING_REQUIRED_STATUSES = new Set<ActiveTrackingStatus>([
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
]);

function healthForTrip(trip: ActiveTrackingTrip, now: number): TrackingHealth {
  const health = trackingHealth(trip.liveLocation, now);
  if (TRACKING_REQUIRED_STATUSES.has(trip.status) && health.level === "waiting") {
    return {
      ...health,
      level: "lost",
      label: "GPS لم يبدأ",
      description: "السائق وصل أو بدأت الرحلة لكن الخادم لم يستلم موقع GPS بعد.",
    };
  }
  return health;
}

function isTrackingAlert(trip: ActiveTrackingTrip, now: number) {
  if (!TRACKING_REQUIRED_STATUSES.has(trip.status)) return false;
  return ["stale", "lost"].includes(healthForTrip(trip, now).level);
}

export function AdminGpsMonitor() {
  const { socket } = useAuth();
  const [trips, setTrips] = useState<ActiveTrackingTrip[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [issuesOnly, setIssuesOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch<ActiveTrackingTrip[]>("/admin/tracking/active-trips");
      setTrips(rows);
      setError("");
      setNow(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل حالة GPS للسائقين.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onLocation = (location: TripLiveLocation) => {
      setTrips((current) =>
        current.map((trip) =>
          trip.tripId === location.tripId ? { ...trip, liveLocation: location } : trip,
        ),
      );
      setNow(Date.now());
    };
    const refresh = () => void load();

    socket.on("trip.location.updated", onLocation);
    socket.on("admin.trip.updated", refresh);
    socket.on("admin.booking.updated", refresh);

    return () => {
      socket.off("trip.location.updated", onLocation);
      socket.off("admin.trip.updated", refresh);
      socket.off("admin.booking.updated", refresh);
    };
  }, [load, socket]);

  const summary = useMemo(() => {
    const expected = trips.filter((trip) => TRACKING_REQUIRED_STATUSES.has(trip.status));
    const alerts = expected.filter((trip) => isTrackingAlert(trip, now));
    const healthy = expected.filter((trip) => {
      const level = healthForTrip(trip, now).level;
      return level === "live" || level === "weak";
    });
    return {
      active: trips.length,
      expected: expected.length,
      healthy: healthy.length,
      alerts: alerts.length,
    };
  }, [now, trips]);

  const visibleTrips = useMemo(
    () => (issuesOnly ? trips.filter((trip) => isTrackingAlert(trip, now)) : trips),
    [issuesOnly, now, trips],
  );

  return (
    <section className="panel" aria-label="مراقبة GPS للسائقين">
      <div className="section-heading">
        <div>
          <span className="eyebrow">المراقبة التشغيلية</span>
          <h2>حالة GPS للسائقين</h2>
          <p className="subtitle">
            تتحدث المواقع فورًا عبر الاتصال المباشر، مع إعادة مزامنة دورية كل 30 ثانية.
          </p>
        </div>
        <div className="actions">
          {summary.alerts > 0 ? (
            <button className="button" type="button" onClick={() => setIssuesOnly((current) => !current)}>
              {issuesOnly ? "عرض كل الرحلات" : `عرض مشاكل GPS (${summary.alerts})`}
            </button>
          ) : null}
          <button className="button" type="button" onClick={() => void load()}>
            تحديث الحالة
          </button>
        </div>
      </div>

      <div className="tracking-summary-grid">
        <div><small>رحلات بسائق نشط</small><strong>{summary.active}</strong></div>
        <div><small>رحلات يجب أن ترسل GPS الآن</small><strong>{summary.expected}</strong></div>
        <div><small>تتبع حديث أو مقبول</small><strong>{summary.healthy}</strong></div>
        <div><small>تحتاج تدخل الإدارة</small><strong>{summary.alerts}</strong></div>
      </div>

      {summary.alerts > 0 ? (
        <div className="notice error">
          يوجد {summary.alerts} {summary.alerts === 1 ? "رحلة تحتاج" : "رحلات تحتاج"} مراجعة GPS الآن.
        </div>
      ) : summary.expected > 0 ? (
        <div className="notice success">كل الرحلات التي تتطلب GPS حاليًا ترسل موقعًا حديثًا أو مقبولًا.</div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      {visibleTrips.length === 0 ? (
        <div className="empty-state">
          {issuesOnly ? "لا توجد مشاكل GPS حالية." : "لا توجد رحلات نشطة معيّن لها سائق حاليًا."}
        </div>
      ) : (
        <div className="booking-list">
          {visibleTrips.map((trip) => {
            const health = healthForTrip(trip, now);
            const trackingRequired = TRACKING_REQUIRED_STATUSES.has(trip.status);
            const waitingBeforeStart = !trackingRequired && health.level === "waiting";
            const displayLevel = waitingBeforeStart ? "waiting" : health.level;
            const displayLabel = waitingBeforeStart ? "لم يبدأ بعد" : health.label;
            const lastLocationLabel = trip.liveLocation
              ? `${health.ageLabel} · ${new Date(trip.liveLocation.recordedAt).toLocaleTimeString("ar")}`
              : trackingRequired
                ? "لم يستلم الخادم أي موقع من السائق"
                : "سيبدأ GPS عند وصول السائق إلى المسافر";

            return (
              <article
                className={`tracking-health-card tracking-health-${displayLevel}`}
                key={trip.tripId}
              >
                <div>
                  <strong>
                    {trip.bookingReference || "رحلة"} · {trip.driverFirstName} {trip.driverLastName}
                  </strong>
                  <small>{TRIP_STATUS_LABELS[trip.status]} · {lastLocationLabel}</small>
                  <small>{waitingBeforeStart ? "لا يعتبر هذا انقطاعًا قبل بدء مرحلة التتبع." : health.description}</small>
                  <Link className="button" href={`/admin/bookings/${trip.tripId}/tracking`}>
                    فتح الخريطة والتتبع
                  </Link>
                </div>
                <span>{displayLabel}</span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
