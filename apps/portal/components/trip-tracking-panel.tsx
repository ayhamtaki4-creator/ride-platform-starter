"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { TrackingMapClient } from "./tracking-map-client";
import { apiFetch } from "@/lib/api";
import { searchPlace, type GeocodingResult } from "@/lib/geocoding";
import { buildRoadRoute } from "@/lib/routing";
import type {
  TrackingShare,
  TripRoutePlan,
  TripTrackingPayload,
  TrackingTrip,
} from "@/lib/tracking";

type Mode = "rider" | "driver" | "admin";
type DraftWaypoint = { latitude: number; longitude: number; label?: string };
type DraftEndpoint = { address: string; latitude: number; longitude: number };

export function TripTrackingPanel({ tripId, mode }: { tripId: string; mode: Mode }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [data, setData] = useState<TripTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [draftWaypoints, setDraftWaypoints] = useState<DraftWaypoint[]>([]);
  const [draftOrigin, setDraftOrigin] = useState<DraftEndpoint | null>(null);
  const [draftDestination, setDraftDestination] = useState<DraftEndpoint | null>(null);
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
        setDraftOrigin({
          address: result.trip.pickupAddress,
          latitude: result.trip.pickupLatitude,
          longitude: result.trip.pickupLongitude,
        });
        setDraftDestination({
          address: result.trip.dropoffAddress,
          latitude: result.trip.dropoffLatitude,
          longitude: result.trip.dropoffLongitude,
        });
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

  const previewTrip = useMemo<TrackingTrip | null>(() => {
    if (!data) return null;
    return {
      ...data.trip,
      ...(draftOrigin
        ? {
            pickupAddress: draftOrigin.address,
            pickupLatitude: draftOrigin.latitude,
            pickupLongitude: draftOrigin.longitude,
          }
        : {}),
      ...(draftDestination
        ? {
            dropoffAddress: draftDestination.address,
            dropoffLatitude: draftDestination.latitude,
            dropoffLongitude: draftDestination.longitude,
          }
        : {}),
    };
  }, [data, draftDestination, draftOrigin]);

  const previewPlan = useMemo(() => {
    if (!data?.routePlan) return null;
    return { ...data.routePlan, waypoints: draftWaypoints };
  }, [data?.routePlan, draftWaypoints]);

  function markDirty() {
    draftDirty.current = true;
  }

  function addWaypoint(point: DraftWaypoint) {
    if (!canEditRoute) return;
    markDirty();
    setDraftWaypoints((current) => [...current, point]);
  }

  function setSearchAsOrigin() {
    if (!canEditRoute || !searchResult) return;
    markDirty();
    setDraftOrigin({
      address: searchResult.label,
      latitude: searchResult.latitude,
      longitude: searchResult.longitude,
    });
    setMessage("تم تعيين الموقع كنقطة انطلاق. اضغط حفظ لتثبيت التعديل.");
  }

  function setSearchAsDestination() {
    if (!canEditRoute || !searchResult) return;
    markDirty();
    setDraftDestination({
      address: searchResult.label,
      latitude: searchResult.latitude,
      longitude: searchResult.longitude,
    });
    setMessage("تم تعيين الموقع كنقطة وصول. اضغط حفظ لتثبيت التعديل.");
  }

  async function saveRoute() {
    if (!data || !canEditRoute || !draftOrigin || !draftDestination) return;
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const points = [
        { latitude: draftOrigin.latitude, longitude: draftOrigin.longitude },
        ...draftWaypoints,
        { latitude: draftDestination.latitude, longitude: draftDestination.longitude },
      ];
      const routed = await buildRoadRoute(points);
      await apiFetch(`/tracking/trips/${tripId}/endpoints`, {
        method: "PATCH",
        body: JSON.stringify({
          originAddress: draftOrigin.address,
          originLatitude: draftOrigin.latitude,
          originLongitude: draftOrigin.longitude,
          destinationAddress: draftDestination.address,
          destinationLatitude: draftDestination.latitude,
          destinationLongitude: draftDestination.longitude,
          geometry: routed.geometry,
          waypoints: draftWaypoints,
          distanceKm: routed.distanceKm,
          durationMinutes: routed.durationMinutes,
        }),
      });
      draftDirty.current = false;
      setMessage(
        mode === "rider"
          ? "تم حفظ نقطة البداية والنهاية والمسار المعدّل لهذا الحجز."
          : "تم حفظ نقاط ومسار هذا الحجز.",
      );
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

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const result = await searchPlace(searchQuery);
      setSearchResult(result);
      setMessage("تم العثور على الموقع. اختر بداية أو نهاية أو نقطة مرور.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر البحث عن الموقع.");
    } finally {
      setSearching(false);
    }
  }

  if (!data || !previewTrip) {
    return <section className="panel"><div className="empty-state">{error || "جارٍ تحميل الخريطة..."}</div></section>;
  }

  const routeSubtitle = mode === "admin"
    ? data.routePlan?.lockedAt
      ? "المسار مقفل لأن الرحلة بدأت أو انتهت."
      : "يمكنك تغيير البداية والنهاية أو إضافة نقاط مرور لهذا الحجز قبل بدء الرحلة."
    : mode === "rider"
      ? data.routePlan?.lockedAt
        ? "تم قفل المسار بعد بدء الرحلة."
        : "يمكنك تعديل نقطة البداية أو النهاية أو الطريق قبل بدء الرحلة."
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

      <div className="tracking-summary-grid">
        <div><small>نقطة الانطلاق</small><strong>{previewTrip.pickupAddress}</strong></div>
        <div><small>نقطة الوصول</small><strong>{previewTrip.dropoffAddress}</strong></div>
        <div><small>حالة التعديل</small><strong>{draftDirty.current ? "تعديلات غير محفوظة" : "محفوظ"}</strong></div>
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
          </form>
          {searchResult ? (
            <div>
              <small className="subtitle">{searchResult.label}</small>
              {canEditRoute ? (
                <div className="actions">
                  <button className="button primary" type="button" onClick={setSearchAsOrigin}>
                    تعيين كنقطة انطلاق
                  </button>
                  <button className="button primary" type="button" onClick={setSearchAsDestination}>
                    تعيين كنقطة وصول
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => addWaypoint({
                      latitude: searchResult.latitude,
                      longitude: searchResult.longitude,
                      label: searchResult.label,
                    })}
                  >
                    إضافة كنقطة مرور
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <TrackingMapClient
        trip={previewTrip}
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
            {working ? "جارٍ الحفظ..." : mode === "rider" ? "حفظ البداية والنهاية والمسار" : "حفظ مسار الحجز"}
          </button>
          <button
            className="button"
            type="button"
            disabled={working || draftWaypoints.length === 0}
            onClick={() => {
              markDirty();
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
              markDirty();
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
