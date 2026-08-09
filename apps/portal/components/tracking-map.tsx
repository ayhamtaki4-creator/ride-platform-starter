"use client";

import L, { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/map-tiles";
import { trackingHealth } from "@/lib/tracking-health";
import type { TripLiveLocation, TripRoutePlan, TrackingTrip } from "@/lib/tracking";

export type TrackingMapProps = {
  trip: TrackingTrip;
  routePlan?: TripRoutePlan | null;
  liveLocation?: TripLiveLocation | null;
  editable?: boolean;
  onAddWaypoint?: (point: { latitude: number; longitude: number }) => void;
  searchPoint?: { latitude: number; longitude: number; label?: string } | null;
  height?: number;
};

function icon(label: string, className: string) {
  return L.divIcon({
    className: "ride-marker-host",
    html: `<span class="ride-marker ${className}" aria-hidden="true"><b>${label}</b></span>`,
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    popupAnchor: [0, -42],
  });
}

const pickupIcon = icon("A", "ride-marker-pickup");
const dropoffIcon = icon("B", "ride-marker-dropoff");
const driverIcon = icon("D", "ride-marker-driver");
const waypointIcon = icon("•", "ride-marker-waypoint");
const searchIcon = icon("S", "ride-marker-waypoint");

function Viewport({ points, fitKey }: { points: LatLngExpression[]; fitKey: string }) {
  const map = useMap();
  const lastFitKey = useRef("");

  useEffect(() => {
    if (points.length === 0 || lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points as LatLngBoundsExpression, { padding: [42, 42], maxZoom: 16 });
  }, [fitKey, map, points]);

  return null;
}

function SearchViewport({ point }: { point?: TrackingMapProps["searchPoint"] }) {
  const map = useMap();
  const lastSearchKey = useRef("");

  useEffect(() => {
    if (!point) return;
    const key = `${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
    if (lastSearchKey.current === key) return;
    lastSearchKey.current = key;
    map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, point]);

  return null;
}

function ClickEditor({ enabled, onAddWaypoint }: { enabled: boolean; onAddWaypoint?: TrackingMapProps["onAddWaypoint"] }) {
  useMapEvents({
    click(event) {
      if (!enabled || !onAddWaypoint) return;
      onAddWaypoint({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

export default function TrackingMap({
  trip,
  routePlan,
  liveLocation,
  editable = false,
  onAddWaypoint,
  searchPoint,
  height = 440,
}: TrackingMapProps) {
  const [now, setNow] = useState(() => Date.now());
  const pickup: LatLngExpression = [trip.pickupLatitude, trip.pickupLongitude];
  const dropoff: LatLngExpression = [trip.dropoffLatitude, trip.dropoffLongitude];

  useEffect(() => {
    setNow(Date.now());
    if (!liveLocation) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [liveLocation?.recordedAt]);

  const route = useMemo<LatLngExpression[]>(() => {
    const coordinates = routePlan?.geometry?.coordinates;
    if (!coordinates?.length) return [pickup, dropoff];
    return coordinates.map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression);
  }, [routePlan, trip.pickupLatitude, trip.pickupLongitude, trip.dropoffLatitude, trip.dropoffLongitude]);

  const health = trackingHealth(liveLocation, now);
  const fitKey = `${routePlan?.version ?? "fallback"}:${trip.pickupLatitude}:${trip.pickupLongitude}:${trip.dropoffLatitude}:${trip.dropoffLongitude}`;

  return (
    <div className="tracking-map-stack">
      <div className="ride-map-frame tracking-map-frame" style={{ height }}>
        <MapContainer center={pickup} zoom={12} className="ride-map" scrollWheelZoom>
          <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} maxZoom={19} />
          <Viewport points={route} fitKey={fitKey} />
          <SearchViewport point={searchPoint} />
          <ClickEditor enabled={editable} onAddWaypoint={onAddWaypoint} />

          <Marker position={pickup} icon={pickupIcon}><Popup><div dir="rtl"><strong>الانطلاق</strong><br />{trip.pickupAddress}</div></Popup></Marker>
          <Marker position={dropoff} icon={dropoffIcon}><Popup><div dir="rtl"><strong>الوصول</strong><br />{trip.dropoffAddress}</div></Popup></Marker>

          {(routePlan?.waypoints ?? []).map((point, index) => (
            <Marker key={`${point.latitude}-${point.longitude}-${index}`} position={[point.latitude, point.longitude]} icon={waypointIcon}>
              <Popup><div dir="rtl"><strong>نقطة مرور {index + 1}</strong>{point.label ? <><br />{point.label}</> : null}</div></Popup>
            </Marker>
          ))}

          {searchPoint ? (
            <Marker position={[searchPoint.latitude, searchPoint.longitude]} icon={searchIcon}>
              <Popup><div dir="rtl"><strong>نتيجة البحث</strong>{searchPoint.label ? <><br />{searchPoint.label}</> : null}</div></Popup>
            </Marker>
          ) : null}

          {liveLocation ? (
            <Marker position={[liveLocation.latitude, liveLocation.longitude]} icon={driverIcon}>
              <Popup>
                <div dir="rtl">
                  <strong>آخر موقع معروف للسيارة</strong>
                  <br />{health.label} · {health.ageLabel}
                  <br />آخر تحديث {new Date(liveLocation.recordedAt).toLocaleTimeString("ar")}
                </div>
              </Popup>
            </Marker>
          ) : null}

          <Polyline positions={route} pathOptions={{ weight: 6, opacity: 0.9 }} />
        </MapContainer>
        {editable ? <div className="map-selection-hint">انقر على الخريطة لإضافة نقطة مرور للمسار</div> : null}
      </div>

      <div className={`tracking-health-card tracking-health-${health.level}`} aria-live="polite">
        <div>
          <strong>{health.label}</strong>
          <small>{health.description}</small>
        </div>
        <span>{health.ageLabel}</span>
      </div>
    </div>
  );
}
