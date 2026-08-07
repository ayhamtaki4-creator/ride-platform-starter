"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";
import { TrackingMapClient } from "./tracking-map-client";
import { apiFetch } from "@/lib/api";
import { buildRoadRoute } from "@/lib/routing";
import type { TrackingShare, TripTrackingPayload } from "@/lib/tracking";

type Mode = "rider" | "driver" | "admin";

export function TripTrackingPanel({ tripId, mode }: { tripId: string; mode: Mode }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [data, setData] = useState<TripTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [draftWaypoints, setDraftWaypoints] = useState<Array<{ latitude: number; longitude: number }>>([]);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<TripTrackingPayload>(`/tracking/trips/${tripId}`);
      setData(result);
      setDraftWaypoints((result.routePlan?.waypoints ?? []).map((point) => ({ latitude: point.latitude, longitude: point.longitude })));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل تتبع الرحلة.");
    }
  }, [tripId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("trip.subscribe", { tripId });
    const onLocation = (location: TripTrackingPayload["liveLocation"]) => {
      if (!location || location.tripId !== tripId) return;
      setData((current) => current ? { ...current, liveLocation: location } : current);
    };
    socket.on("trip.location.updated", onLocation);
    return () => { socket.off("trip.location.updated", onLocation); };
  }, [socket, tripId]);

  const previewPlan = useMemo(() => {
    if (!data?.routePlan) return null;
    return { ...data.routePlan, waypoints: draftWaypoints };
  }, [data?.routePlan, draftWaypoints]);

  async function saveRoute() {
    if (!data || mode !== "admin") return;
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const points = [
        { latitude: data.trip.pickupLatitude, longitude: data.trip.pickupLongitude },
        ...draftWaypoints,
        { latitude: data.trip.dropoffLatitude, longitude: data.trip.dropoffLongitude },
      ];
      const routed = await buildRoadRoute(points);
      await apiFetch(`/tracking/trips/${tripId}/route-plan`, {
        method: "PATCH",
        body: JSON.stringify({
          geometry: routed.geometry,
          waypoints: draftWaypoints,
          distanceKm: routed.distanceKm,
          durationMinutes: routed.durationMinutes,
        }),
      });
      setMessage("تم حفظ الطريق الفعلي وسيُقفل تلقائيًا عند تعيين السائق.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المسار.");
    } finally {
      setWorking(false);
    }
  }

  async function shareTrip() {
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const share = await apiFetch<TrackingShare>(`/tracking/trips/${tripId}/shares`, { method: "POST" });
      const url = `${window.location.origin}/track/${share.token}`;
      if (navigator.share) await navigator.share({ title: "متابعة الرحلة", url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("تم نسخ رابط متابعة الرحلة.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء رابط المشاركة.");
    } finally {
      setWorking(false);
    }
  }

  if (!data) return <section className="panel"><div className="empty-state">{error || "جارٍ تحميل الخريطة..."}</div></section>;

  return (
    <section className="panel tracking-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">الخريطة والتتبع</span>
          <h2>{mode === "admin" ? "تخطيط مسار الرحلة" : "مسار الرحلة المباشر"}</h2>
          <p className="subtitle">
            {mode === "admin"
              ? data.routePlan?.lockedAt ? "المسار مقفل لأنه تم تعيين السائق." : "انقر على الخريطة لإضافة نقاط مرور ثم احفظ الطريق قبل التعيين."
              : isRealtimeConnected ? "الموقع يتحدث مباشرة عند إرسال GPS من جهاز السائق." : "الاتصال المباشر غير متاح؛ يتم التحديث دوريًا."}
          </p>
        </div>
        <div className="actions">
          {mode === "rider" ? <button className="button primary" type="button" disabled={working} onClick={() => void shareTrip()}>مشاركة الرحلة</button> : null}
          <button className="button" type="button" onClick={() => void load()}>تحديث</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <TrackingMapClient
        trip={data.trip}
        routePlan={previewPlan ?? data.routePlan}
        liveLocation={data.liveLocation}
        editable={mode === "admin" && !data.routePlan?.lockedAt}
        onAddWaypoint={(point) => setDraftWaypoints((current) => [...current, point])}
      />

      <div className="tracking-summary-grid">
        <div><small>المسافة</small><strong>{data.routePlan?.distanceKm != null ? `${data.routePlan.distanceKm.toFixed(1)} كم` : "—"}</strong></div>
        <div><small>المدة التقديرية</small><strong>{data.routePlan?.durationMinutes != null ? `${data.routePlan.durationMinutes} دقيقة` : "—"}</strong></div>
        <div><small>آخر موقع</small><strong>{data.liveLocation ? new Date(data.liveLocation.recordedAt).toLocaleTimeString("ar") : "لم يبدأ التتبع"}</strong></div>
      </div>

      {mode === "admin" && !data.routePlan?.lockedAt ? (
        <div className="actions">
          <button className="button primary" type="button" disabled={working} onClick={() => void saveRoute()}>{working ? "جارٍ الحفظ..." : "حفظ المسار واعتماده"}</button>
          <button className="button" type="button" disabled={working || draftWaypoints.length === 0} onClick={() => setDraftWaypoints((current) => current.slice(0, -1))}>إزالة آخر نقطة</button>
          <button className="button" type="button" disabled={working || draftWaypoints.length === 0} onClick={() => setDraftWaypoints([])}>مسح نقاط المرور</button>
        </div>
      ) : null}
    </section>
  );
}
