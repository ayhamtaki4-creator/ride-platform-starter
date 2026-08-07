"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { TrackingMapClient } from "./tracking-map-client";
import { apiFetch } from "@/lib/api";
import { searchPlace, type GeocodingResult } from "@/lib/geocoding";
import { buildRoadRoute } from "@/lib/routing";
import type { TrackingShare, TripRoutePlan, TripTrackingPayload } from "@/lib/tracking";

type Mode = "rider" | "driver" | "admin";
type DraftWaypoint = { latitude: number; longitude: number; label?: string };

export function TripTrackingPanel({ tripId, mode }: { tripId: string; mode: Mode }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [data, setData] = useState<TripTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [draftWaypoints, setDraftWaypoints] = useState<DraftWaypoint[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<GeocodingResult | null>(null);
  const draftDirty = useRef(false);
  const autoRouteKey = useRef("");

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<TripTrackingPayload>(`/tracking/trips/${tripId}`);
      setData(result);
      if (!draftDirty.current) {
        setDraftWaypoints(
          (result.routePlan?.waypoints ?? []).map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            label: point.label,
          })),
        );
      }
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

  useEffect(() => {
    if (mode !== "admin" || !data || data.routePlan?.lockedAt) return;
    const coordinates = data.routePlan?.geometry?.coordinates ?? [];
    if (coordinates.length > 2) return;

    const key = `${tripId}:${data.routePlan?.version ?? 0}`;
    if (autoRouteKey.current === key) return;
    autoRouteKey.current = key;

    void (async () => {
      setWorking(true);
      try {
        const routed = await buildRoadRoute([
          { latitude: data.trip.pickupLatitude, longitude: data.trip.pickupLongitude },
          { latitude: data.trip.dropoffLatitude, longitude: data.trip.dropoffLongitude },
        ]);
        const saved = await apiFetch<TripRoutePlan>(`/tracking/trips/${tripId}/route-plan`, {
          method: "PATCH",
          body: JSON.stringify({
            geometry: routed.geometry,
            waypoints: [],
            distanceKm: routed.distanceKm,
            durationMinutes: routed.durationMinutes,
          }),
        });
        draftDirty.current = false;
        setDraftWaypoints([]);
        setData((current) => current ? { ...current, routePlan: saved } : current);
        setMessage("تم حساب الطريق الفعلي وحفظه تلقائيًا لهذا الحجز.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "تعذر ضبط المسار تلقائيًا.");
      } finally {
        setWorking(false);
      }
    })();
  }, [data, mode, tripId]);

  const previewPlan = useMemo(() => {
    if (!data?.routePlan) return null;
    return { ...data.routePlan, waypoints: draftWaypoints };
  }, [data?.routePlan, draftWaypoints]);

  const canEditRoute = Boolean(
    data &&
    mode !== "driver" &&
    !data.routePlan?.lockedAt &&
    ![
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED_BY_PASSENGER",
      "CANCELLED_BY_DRIVER",
      "NO_DRIVER_AVAILABLE",
      "PASSENGER_NO_SHOW",
      "DRIVER_NO_SHOW",
    ].includes(data.trip.status),
  );

  function addWaypoint(point: DraftWaypoint) {
    if (!canEditRoute) return;
    draftDirty.current = true;
    setDraftWaypoints((current) => [...current, point]);
  }

  async function saveRoute() {
    if (!data || !canEditRoute) return;
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
      const saved = await apiFetch<TripRoutePlan>(`/tracking/trips/${tripId}/route-plan`, {
        method: "PATCH",
        body: JSON.stringify({
          geometry: routed.geometry,
          waypoints: draftWaypoints,
          distanceKm: routed.distanceKm,
          durationMinutes: routed.durationMinutes,
        }),
      });
      draftDirty.current = false;
      setData((current) => current ? { ...current, routePlan: saved } : current);
      setMessage(mode === "rider" ? "تم حفظ تعديلك على مسار الرحلة." : "تم حفظ المسار واعتماده لهذا الحجز.");
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

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const result = await searchPlace(searchQuery);
      setSearchResult(result);
      setMessage("تم العثور على الموقع وإظهاره على الخريطة.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر البحث عن الموقع.");
    } finally {
      setSearching(false);
    }
  }

  if (!data) return <section className="panel"><div className="empty-state">{error || "جارٍ تحميل الخريطة..."}</div></section>;

  const routeSubtitle = mode === "admin"
    ? data.routePlan?.lockedAt
      ? "المسار مقفل لأن الرحلة بدأت أو انتهت."
      : "يتم حفظ الطريق الفعلي تلقائيًا. يمكنك البحث أو النقر على الخريطة لإضافة نقاط مرور ثم حفظ التعديل."
    : mode === "rider"
      ? data.routePlan?.lockedAt
        ? "تم قفل المسار بعد بدء الرحلة."
        : "يمكنك تعديل مسارك قبل بدء الرحلة بالبحث أو بإضافة نقاط مرور على الخريطة."
      : isRealtimeConnected
        ? "الموقع يتحدث مباشرة عند إرسال GPS من جهاز السائق."
        : "الاتصال المباشر غير متاح؛ يتم التحديث دوريًا.";

  return (
    <section className="panel tracking-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">الخريطة والتتبع</span>
          <h2>{mode === "admin" ? "تخطيط مسار الرحلة" : "مسار الرحلة المباشر"}</h2>
          <p className="subtitle">{routeSubtitle}</p>
        </div>
        <div className="actions">
          {mode === "rider" ? <button className="button primary" type="button" disabled={working} onClick={() => void shareTrip()}>مشاركة الرحلة</button> : null}
          <button className="button" type="button" onClick={() => void load()}>تحديث البيانات</button>
        </div>
      </div>

      {mode !== "driver" ? (
        <div className="tracking-search-block">
          <form className="actions" onSubmit={(event) => void handleSearch(event)}>
            <input
              className="input"
              type="search"
              placeholder="ابحث عن مكان أو عنوان..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button className="button" type="submit" disabled={searching}>
              {searching ? "جارٍ البحث..." : "بحث على الخريطة"}
            </button>
            {searchResult && canEditRoute ? (
              <button
                className="button primary"
                type="button"
                onClick={() => addWaypoint({
                  latitude: searchResult.latitude,
                  longitude: searchResult.longitude,
                  label: searchResult.label,
                })}
              >
                إضافة نتيجة البحث للمسار
              </button>
            ) : null}
          </form>
          {searchResult ? <small className="subtitle">{searchResult.label}</small> : null}
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <TrackingMapClient
        trip={data.trip}
        routePlan={previewPlan ?? data.routePlan}
        liveLocation={data.liveLocation}
        editable={canEditRoute}
        searchPoint={searchResult}
        onAddWaypoint={(point) => addWaypoint(point)}
      />

      <div className="tracking-summary-grid">
        <div><small>المسافة</small><strong>{data.routePlan?.distanceKm != null ? `${data.routePlan.distanceKm.toFixed(1)} كم` : "—"}</strong></div>
        <div><small>المدة التقديرية</small><strong>{data.routePlan?.durationMinutes != null ? `${data.routePlan.durationMinutes} دقيقة` : "—"}</strong></div>
        <div><small>آخر موقع</small><strong>{data.liveLocation ? new Date(data.liveLocation.recordedAt).toLocaleTimeString("ar") : "لم يبدأ التتبع"}</strong></div>
      </div>

      {canEditRoute ? (
        <div className="actions">
          <button className="button primary" type="button" disabled={working} onClick={() => void saveRoute()}>
            {working ? "جارٍ الحفظ..." : mode === "rider" ? "حفظ تعديلي على المسار" : "حفظ المسار واعتماده"}
          </button>
          <button
            className="button"
            type="button"
            disabled={working || draftWaypoints.length === 0}
            onClick={() => {
              draftDirty.current = true;
              setDraftWaypoints((current) => current.slice(0, -1));
            }}
          >
            إزالة آخر نقطة
          </button>
          <button
            className="button"
            type="button"
            disabled={working || draftWaypoints.length === 0}
            onClick={() => {
              draftDirty.current = true;
              setDraftWaypoints([]);
            }}
          >
            مسح نقاط المرور
          </button>
        </div>
      ) : null}
    </section>
  );
}
