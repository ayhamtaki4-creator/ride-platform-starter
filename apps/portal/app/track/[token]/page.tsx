"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TrackingMapClient } from "@/components/tracking-map-client";
import { apiFetch } from "@/lib/api";
import type { TripTrackingPayload } from "@/lib/tracking";

export default function PublicTrackingPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<TripTrackingPayload | null>(null);
  const [error, setError] = useState("");

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
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <main className="public-tracking-page" dir="rtl">
      <section className="public-tracking-header">
        <div>
          <span className="eyebrow">Sham Route</span>
          <h1>متابعة الرحلة</h1>
          <p>رابط متابعة آمن يعرض مسار السيارة وموقعها الحالي فقط.</p>
        </div>
        <span className="status">{data?.trip.status ?? "جارٍ الاتصال"}</span>
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
