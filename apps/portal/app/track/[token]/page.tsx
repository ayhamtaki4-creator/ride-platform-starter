"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { TrackingMapClient } from "@/components/tracking-map-client";
import { apiFetch, getRealtimeUrl } from "@/lib/api";
import type { TripLiveLocation, TripTrackingPayload } from "@/lib/tracking";

export default function PublicTrackingPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<TripTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [isLive, setIsLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<TripTrackingPayload>(`/tracking/public/${params.token}`, { skipAuth: true });
      setData(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل متابعة الرحلة.");
    }
  }, [params.token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!params.token) return;
    const socket = io(getRealtimeUrl(), {
      auth: { trackingToken: params.token },
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    const onReady = () => setIsLive(true);
    const onDisconnect = () => setIsLive(false);
    const onAuthError = () => setIsLive(false);
    const onLocation = (location: TripLiveLocation) => {
      setData((current) =>
        current && location.tripId === current.trip.id
          ? { ...current, liveLocation: location }
          : current,
      );
    };

    socket.on("tracking.ready", onReady);
    socket.on("disconnect", onDisconnect);
    socket.on("realtime.auth.error", onAuthError);
    socket.on("trip.location.updated", onLocation);

    return () => {
      socket.off("tracking.ready", onReady);
      socket.off("disconnect", onDisconnect);
      socket.off("realtime.auth.error", onAuthError);
      socket.off("trip.location.updated", onLocation);
      socket.disconnect();
    };
  }, [params.token]);

  return (
    <main className="public-tracking-page" dir="rtl">
      <section className="public-tracking-header">
        <div>
          <span className="eyebrow">Sham Route</span>
          <h1>متابعة الرحلة</h1>
          <p>رابط متابعة آمن يعرض مسار السيارة وموقعها الحالي فقط.</p>
        </div>
        <div>
          <span className="status">{data?.trip.status ?? "جارٍ الاتصال"}</span>
          <div className={`connection-badge ${isLive ? "is-online" : "is-offline"}`}>
            {isLive ? "تتبع مباشر" : "تحديث دوري"}
          </div>
        </div>
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {data ? (
        <>
          <TrackingMapClient trip={data.trip} routePlan={data.routePlan} liveLocation={data.liveLocation} height={520} />
          <section className="panel public-tracking-summary">
            <div><small>الانطلاق</small><strong>{data.trip.pickupAddress}</strong></div>
            <div><small>الوجهة</small><strong>{data.trip.dropoffAddress}</strong></div>
            <div><small>السائق</small><strong>{data.trip.driver ? `${data.trip.driver.firstName} ${data.trip.driver.lastName}` : "لم يتم تعيين السائق بعد"}</strong></div>
            <div><small>آخر تحديث للموقع</small><strong>{data.liveLocation ? new Date(data.liveLocation.recordedAt).toLocaleTimeString("ar") : "لم يبدأ التتبع بعد"}</strong></div>
          </section>
        </>
      ) : !error ? <div className="empty-state">جارٍ تحميل الرحلة...</div> : null}
    </main>
  );
}
