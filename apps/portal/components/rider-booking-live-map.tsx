"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { TrackingMapClient } from "./tracking-map-client";
import { apiFetch } from "@/lib/api";
import type { TrackingShare, TripTrackingPayload } from "@/lib/tracking";

export function RiderBookingLiveMap({ tripId }: { tripId: string }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [data, setData] = useState<TripTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<TripTrackingPayload>(`/tracking/trips/${tripId}`);
      setData(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل خريطة الرحلة.");
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
    return () => {
      socket.off("trip.location.updated", onLocation);
    };
  }, [socket, tripId]);

  async function shareTrip() {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const share = await apiFetch<TrackingShare>(`/tracking/trips/${tripId}/shares`, {
        method: "POST",
      });
      const url = `${window.location.origin}/track/${share.token}`;
      if (navigator.share) {
        await navigator.share({ title: "متابعة الرحلة مباشرة", url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("تم نسخ رابط الموقع المباشر.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء رابط مشاركة الموقع.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="panel rider-detail-panel" aria-label="الخريطة والموقع المباشر">
      <div className="section-heading rider-section-heading">
        <div>
          <span className="eyebrow">الخريطة والموقع المباشر</span>
          <h2>موقع الرحلة والسيارة</h2>
          <p className="subtitle">
            {isRealtimeConnected
              ? "الخريطة متصلة بالتحديث المباشر لموقع السائق."
              : "يتم تحديث الموقع دوريًا إلى حين عودة الاتصال المباشر."}
          </p>
        </div>
        <div className="actions">
          <button className="button primary" type="button" disabled={working} onClick={() => void shareTrip()}>
            {working ? "جارٍ إنشاء الرابط..." : "مشاركة الموقع المباشر"}
          </button>
          <button className="button" type="button" onClick={() => void load()}>تحديث</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {data ? (
        <>
          <div className="tracking-summary-grid">
            <div><small>موقع الالتقاط المحدد</small><strong>{data.trip.pickupAddress}</strong></div>
            <div><small>نقطة الوصول</small><strong>{data.trip.dropoffAddress}</strong></div>
            <div>
              <small>آخر موقع للسائق</small>
              <strong>{data.liveLocation ? new Date(data.liveLocation.recordedAt).toLocaleTimeString("ar") : "لم يبدأ التتبع بعد"}</strong>
            </div>
          </div>
          <TrackingMapClient
            trip={data.trip}
            routePlan={data.routePlan}
            liveLocation={data.liveLocation}
            editable={false}
          />
        </>
      ) : (
        <div className="empty-state">جارٍ تحميل الخريطة...</div>
      )}
    </section>
  );
}
