"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { searchPlace, type GeocodingResult } from "@/lib/geocoding";
import { buildRoadRoute } from "@/lib/routing";
import type { AdminRouteTemplateRecord, SavedRouteTemplate } from "@/lib/route-templates";
import type { TripRoutePlan, TrackingTrip } from "@/lib/tracking";
import { TrackingMapClient } from "@/components/tracking-map-client";

type Endpoint = {
  address: string;
  latitude: number;
  longitude: number;
};

type Waypoint = { latitude: number; longitude: number; label?: string };

function validCoordinate(value: unknown, limit: number) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function RouteTemplateEditor({ routeId }: { routeId: string }) {
  const [record, setRecord] = useState<AdminRouteTemplateRecord | null>(null);
  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [geometry, setGeometry] = useState<SavedRouteTemplate["geometry"]>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<GeocodingResult | null>(null);
  const [working, setWorking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<AdminRouteTemplateRecord>(`/admin/route-templates/${routeId}`);
      setRecord(data);
      if (data.template) {
        setOrigin({
          address: data.template.originAddress,
          latitude: data.template.originLatitude,
          longitude: data.template.originLongitude,
        });
        setDestination({
          address: data.template.destinationAddress,
          latitude: data.template.destinationLatitude,
          longitude: data.template.destinationLongitude,
        });
        setWaypoints(data.template.waypoints ?? []);
        setGeometry(data.template.geometry);
        setDistanceKm(data.template.distanceKm);
        setDurationMinutes(data.template.durationMinutes);
      } else {
        const originLat = validCoordinate(data.route.origin.latitude, 90);
        const originLon = validCoordinate(data.route.origin.longitude, 180);
        const destinationLat = validCoordinate(data.route.destination.latitude, 90);
        const destinationLon = validCoordinate(data.route.destination.longitude, 180);
        setOrigin(
          originLat != null && originLon != null
            ? { address: data.route.origin.nameAr, latitude: originLat, longitude: originLon }
            : null,
        );
        setDestination(
          destinationLat != null && destinationLon != null
            ? {
                address: data.route.destination.nameAr,
                latitude: destinationLat,
                longitude: destinationLon,
              }
            : null,
        );
        setWaypoints([]);
        setGeometry(null);
        setDistanceKm(null);
        setDurationMinutes(null);
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل قالب المسار.");
    }
  }, [routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const result = await searchPlace(searchQuery);
      setSearchResult(result);
      setMessage("تم العثور على الموقع. اختر كيف تريد استخدامه في المسار.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر البحث عن الموقع.");
    } finally {
      setSearching(false);
    }
  }

  function invalidateRoute() {
    setGeometry(null);
    setDistanceKm(null);
    setDurationMinutes(null);
  }

  function setSearchAsOrigin() {
    if (!searchResult) return;
    setOrigin({
      address: searchResult.label,
      latitude: searchResult.latitude,
      longitude: searchResult.longitude,
    });
    invalidateRoute();
    setMessage("تم تعيين نتيجة البحث كنقطة انطلاق.");
  }

  function setSearchAsDestination() {
    if (!searchResult) return;
    setDestination({
      address: searchResult.label,
      latitude: searchResult.latitude,
      longitude: searchResult.longitude,
    });
    invalidateRoute();
    setMessage("تم تعيين نتيجة البحث كنقطة وصول.");
  }

  function addSearchWaypoint() {
    if (!searchResult) return;
    setWaypoints((current) => [
      ...current,
      {
        latitude: searchResult.latitude,
        longitude: searchResult.longitude,
        label: searchResult.label,
      },
    ]);
    invalidateRoute();
    setMessage("تمت إضافة نتيجة البحث كنقطة مرور.");
  }

  function addMapWaypoint(point: { latitude: number; longitude: number }) {
    setWaypoints((current) => [...current, point]);
    invalidateRoute();
  }

  async function calculate() {
    if (!origin || !destination) {
      throw new Error("حدد نقطة الانطلاق والوصول أولًا.");
    }
    const routed = await buildRoadRoute([
      { latitude: origin.latitude, longitude: origin.longitude },
      ...waypoints,
      { latitude: destination.latitude, longitude: destination.longitude },
    ]);
    setGeometry(routed.geometry);
    setDistanceKm(routed.distanceKm);
    setDurationMinutes(routed.durationMinutes);
    return routed;
  }

  async function calculateOnly() {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await calculate();
      setMessage("تم حساب الطريق الفعلي. راجعه ثم اضغط حفظ القالب.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حساب الطريق.");
    } finally {
      setWorking(false);
    }
  }

  async function save() {
    if (!origin || !destination) {
      setError("حدد نقطة الانطلاق والوصول أولًا.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const routed = geometry
        ? { geometry, distanceKm: distanceKm ?? 0, durationMinutes: durationMinutes ?? 0 }
        : await calculate();
      const saved = await apiFetch<SavedRouteTemplate>(`/admin/route-templates/${routeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          originAddress: origin.address,
          originLatitude: origin.latitude,
          originLongitude: origin.longitude,
          destinationAddress: destination.address,
          destinationLatitude: destination.latitude,
          destinationLongitude: destination.longitude,
          geometry: routed.geometry,
          waypoints,
          distanceKm: routed.distanceKm,
          durationMinutes: routed.durationMinutes,
        }),
      });
      setGeometry(saved.geometry);
      setWaypoints(saved.waypoints ?? []);
      setDistanceKm(saved.distanceKm);
      setDurationMinutes(saved.durationMinutes);
      setMessage("تم حفظ قالب المسار. أي حجز جديد على هذا الخط سيستخدم هذه البداية والنهاية والطريق تلقائيًا.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ قالب المسار.");
    } finally {
      setWorking(false);
    }
  }

  const trip = useMemo<TrackingTrip | null>(() => {
    if (!origin || !destination) return null;
    return {
      id: routeId,
      status: "ROUTE_TEMPLATE",
      pickupAddress: origin.address,
      pickupLatitude: origin.latitude,
      pickupLongitude: origin.longitude,
      dropoffAddress: destination.address,
      dropoffLatitude: destination.latitude,
      dropoffLongitude: destination.longitude,
      travelDate: null,
    };
  }, [destination, origin, routeId]);

  const routePlan = useMemo<TripRoutePlan | null>(() => {
    if (!trip) return null;
    return {
      tripId: routeId,
      geometry:
        geometry ?? {
          type: "LineString",
          coordinates: [
            [trip.pickupLongitude, trip.pickupLatitude],
            [trip.dropoffLongitude, trip.dropoffLatitude],
          ],
        },
      waypoints,
      distanceKm,
      durationMinutes,
      version: 1,
      lockedAt: null,
      updatedAt: new Date(0).toISOString(),
    };
  }, [distanceKm, durationMinutes, geometry, routeId, trip, waypoints]);

  if (!record) {
    return <section className="panel"><div className="empty-state">{error || "جارٍ تحميل المسار..."}</div></section>;
  }

  return (
    <section className="panel tracking-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{record.route.code}</span>
          <h2>{record.route.nameAr}</h2>
          <p className="subtitle">
            حدّد نقطة الانطلاق والوصول بدقة، وأضف نقاط مرور عند الحاجة، ثم احسب الطريق واحفظه كقالب دائم.
          </p>
        </div>
        <div className="actions">
          <button className="button" type="button" disabled={working} onClick={() => void calculateOnly()}>
            حساب الطريق
          </button>
          <button className="button primary" type="button" disabled={working} onClick={() => void save()}>
            {working ? "جارٍ الحفظ..." : "حفظ قالب المسار"}
          </button>
        </div>
      </div>

      <div className="tracking-summary-grid">
        <div><small>نقطة الانطلاق</small><strong>{origin?.address ?? "غير محددة"}</strong></div>
        <div><small>نقطة الوصول</small><strong>{destination?.address ?? "غير محددة"}</strong></div>
        <div><small>الحالة</small><strong>{record.template ? "قالب محفوظ" : "يحتاج إعداد"}</strong></div>
      </div>

      <div className="tracking-search-block">
        <form className="actions" onSubmit={(event) => void handleSearch(event)}>
          <input
            className="input"
            type="search"
            placeholder="مثال: مطار رفيق الحريري الدولي بيروت"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button className="button" type="submit" disabled={searching}>
            {searching ? "جارٍ البحث..." : "بحث على الخريطة"}
          </button>
        </form>
        {searchResult ? (
          <div>
            <p className="subtitle">{searchResult.label}</p>
            <div className="actions">
              <button className="button primary" type="button" onClick={setSearchAsOrigin}>تعيين كنقطة انطلاق</button>
              <button className="button primary" type="button" onClick={setSearchAsDestination}>تعيين كنقطة وصول</button>
              <button className="button" type="button" onClick={addSearchWaypoint}>إضافة كنقطة مرور</button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {trip && routePlan ? (
        <TrackingMapClient
          trip={trip}
          routePlan={routePlan}
          liveLocation={null}
          editable
          searchPoint={searchResult}
          onAddWaypoint={addMapWaypoint}
        />
      ) : (
        <div className="empty-state">ابحث عن نقطة الانطلاق والوصول لتظهر الخريطة.</div>
      )}

      <div className="tracking-summary-grid">
        <div><small>المسافة</small><strong>{distanceKm != null ? `${distanceKm.toFixed(1)} كم` : "لم تُحسب"}</strong></div>
        <div><small>المدة التقديرية</small><strong>{durationMinutes != null ? `${durationMinutes} دقيقة` : "لم تُحسب"}</strong></div>
        <div><small>نقاط المرور</small><strong>{waypoints.length}</strong></div>
      </div>

      <div className="actions">
        <button
          className="button"
          type="button"
          disabled={working || waypoints.length === 0}
          onClick={() => {
            setWaypoints((current) => current.slice(0, -1));
            invalidateRoute();
          }}
        >
          إزالة آخر نقطة
        </button>
        <button
          className="button"
          type="button"
          disabled={working || waypoints.length === 0}
          onClick={() => {
            setWaypoints([]);
            invalidateRoute();
          }}
        >
          مسح نقاط المرور
        </button>
      </div>
    </section>
  );
}
