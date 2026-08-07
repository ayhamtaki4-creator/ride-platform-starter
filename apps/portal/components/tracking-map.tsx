"use client";

import L, { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { TripLiveLocation, TripRoutePlan, TrackingTrip } from "@/lib/tracking";

export type TrackingMapProps = {
  trip: TrackingTrip;
  routePlan?: TripRoutePlan | null;
  liveLocation?: TripLiveLocation | null;
  editable?: boolean;
  onAddWaypoint?: (point: { latitude: number; longitude: number }) => void;
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

function Viewport({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points as LatLngBoundsExpression, { padding: [42, 42], maxZoom: 16 });
  }, [map, points]);
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
  height = 440,
}: TrackingMapProps) {
  const pickup: LatLngExpression = [trip.pickupLatitude, trip.pickupLongitude];
  const dropoff: LatLngExpression = [trip.dropoffLatitude, trip.dropoffLongitude];

  const route = useMemo<LatLngExpression[]>(() => {
    const coordinates = routePlan?.geometry?.coordinates;
    if (!coordinates?.length) return [pickup, dropoff];
    return coordinates.map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression);
  }, [routePlan, trip.pickupLatitude, trip.pickupLongitude, trip.dropoffLatitude, trip.dropoffLongitude]);

  const points = useMemo(() => {
    const result: LatLngExpression[] = [...route];
    if (liveLocation) result.push([liveLocation.latitude, liveLocation.longitude]);
    return result;
  }, [route, liveLocation]);

  return (
    <div className="ride-map-frame tracking-map-frame" style={{ height }}>
      <MapContainer center={pickup} zoom={12} className="ride-map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Viewport points={points} />
        <ClickEditor enabled={editable} onAddWaypoint={onAddWaypoint} />

        <Marker position={pickup} icon={pickupIcon}><Popup><div dir="rtl"><strong>الانطلاق</strong><br />{trip.pickupAddress}</div></Popup></Marker>
        <Marker position={dropoff} icon={dropoffIcon}><Popup><div dir="rtl"><strong>الوصول</strong><br />{trip.dropoffAddress}</div></Popup></Marker>

        {(routePlan?.waypoints ?? []).map((point, index) => (
          <Marker key={`${point.latitude}-${point.longitude}-${index}`} position={[point.latitude, point.longitude]} icon={waypointIcon}>
            <Popup><div dir="rtl"><strong>نقطة مرور {index + 1}</strong>{point.label ? <><br />{point.label}</> : null}</div></Popup>
          </Marker>
        ))}

        {liveLocation ? (
          <Marker position={[liveLocation.latitude, liveLocation.longitude]} icon={driverIcon}>
            <Popup><div dir="rtl"><strong>موقع السيارة الآن</strong><br />آخر تحديث {new Date(liveLocation.recordedAt).toLocaleTimeString("ar")}</div></Popup>
          </Marker>
        ) : null}

        <Polyline positions={route} pathOptions={{ weight: 6, opacity: 0.9 }} />
      </MapContainer>
      {editable ? <div className="map-selection-hint">انقر على الخريطة لإضافة نقطة مرور للمسار</div> : null}
    </div>
  );
}
