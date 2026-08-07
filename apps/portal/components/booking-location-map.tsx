"use client";

import L, { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type BookingMapPoint = {
  latitude: number;
  longitude: number;
  label?: string;
};

type BookingLocationMapProps = {
  pickup: BookingMapPoint | null;
  dropoff: BookingMapPoint | null;
  activeMode: "pickup" | "dropoff";
  fitKey: string;
  onSelect: (point: { latitude: number; longitude: number }) => void;
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

function PickerEvents({
  activeMode,
  onSelect,
}: {
  activeMode: "pickup" | "dropoff";
  onSelect: BookingLocationMapProps["onSelect"];
}) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return (
    <div className="map-selection-hint">
      {activeMode === "pickup"
        ? "انقر على الخريطة لتحديد نقطة الانطلاق"
        : "انقر على الخريطة لتحديد نقطة الوصول"}
    </div>
  );
}

function InitialViewport({ points, fitKey }: { points: LatLngExpression[]; fitKey: string }) {
  const map = useMap();
  const lastFitKey = useRef("");

  useEffect(() => {
    if (!points.length || lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points as LatLngBoundsExpression, { padding: [38, 38], maxZoom: 15 });
  }, [fitKey, map, points]);

  return null;
}

export default function BookingLocationMap({
  pickup,
  dropoff,
  activeMode,
  fitKey,
  onSelect,
}: BookingLocationMapProps) {
  const fallback: LatLngExpression = [33.5138, 36.2765];
  const center: LatLngExpression = pickup
    ? [pickup.latitude, pickup.longitude]
    : dropoff
      ? [dropoff.latitude, dropoff.longitude]
      : fallback;
  const points: LatLngExpression[] = [];
  if (pickup) points.push([pickup.latitude, pickup.longitude]);
  if (dropoff) points.push([dropoff.latitude, dropoff.longitude]);

  return (
    <div className="ride-map-frame booking-location-map" style={{ height: 390 }}>
      <MapContainer center={center} zoom={11} className="ride-map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <InitialViewport points={points} fitKey={fitKey} />
        <PickerEvents activeMode={activeMode} onSelect={onSelect} />

        {pickup ? (
          <Marker position={[pickup.latitude, pickup.longitude]} icon={pickupIcon}>
            <Popup>
              <div dir="rtl">
                <strong>نقطة الانطلاق</strong>
                {pickup.label ? <><br />{pickup.label}</> : null}
              </div>
            </Popup>
          </Marker>
        ) : null}

        {dropoff ? (
          <Marker position={[dropoff.latitude, dropoff.longitude]} icon={dropoffIcon}>
            <Popup>
              <div dir="rtl">
                <strong>نقطة الوصول</strong>
                {dropoff.label ? <><br />{dropoff.label}</> : null}
              </div>
            </Popup>
          </Marker>
        ) : null}

        {pickup && dropoff ? (
          <Polyline
            positions={[
              [pickup.latitude, pickup.longitude],
              [dropoff.latitude, dropoff.longitude],
            ]}
            pathOptions={{ weight: 4, opacity: 0.7, dashArray: "8 8" }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
