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
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/map-tiles";

export type MapPoint = {
  latitude: number;
  longitude: number;
  label?: string;
};

export type RideMapProps = {
  pickup: MapPoint;
  dropoff: MapPoint;
  driverLocation?: MapPoint | null;
  editable?: boolean;
  selectionMode?: "pickup" | "dropoff";
  onSelect?: (point: MapPoint) => void;
  height?: number;
};

function isValidPoint(point: MapPoint | null | undefined): point is MapPoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
  );
}

function toLatLng(point: MapPoint): LatLngExpression {
  return [point.latitude, point.longitude];
}

function markerIcon(kind: "pickup" | "dropoff" | "driver") {
  const label = kind === "pickup" ? "A" : kind === "dropoff" ? "B" : "D";

  return L.divIcon({
    className: "ride-marker-host",
    html: `<span class="ride-marker ride-marker-${kind}" aria-hidden="true"><b>${label}</b></span>`,
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    popupAnchor: [0, -42],
  });
}

const pickupIcon = markerIcon("pickup");
const dropoffIcon = markerIcon("dropoff");
const driverIcon = markerIcon("driver");

function MapSelection({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect?: (point: MapPoint) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled || !onSelect) return;

      onSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
}

function MapViewport({
  pickup,
  dropoff,
  driverLocation,
}: {
  pickup: MapPoint;
  dropoff: MapPoint;
  driverLocation?: MapPoint | null;
}) {
  const map = useMap();

  useEffect(() => {
    const points = [pickup, dropoff, driverLocation].filter(isValidPoint);

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(toLatLng(points[0]), 15, { animate: true });
      return;
    }

    const bounds: LatLngBoundsExpression = points.map((point) =>
      toLatLng(point)
    ) as LatLngBoundsExpression;

    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 16,
      animate: true,
    });
  }, [map, pickup, dropoff, driverLocation]);

  return null;
}

export default function RideMap({
  pickup,
  dropoff,
  driverLocation,
  editable = false,
  selectionMode = "pickup",
  onSelect,
  height = 420,
}: RideMapProps) {
  const initialCenter = useMemo<LatLngExpression>(() => {
    if (isValidPoint(pickup)) return toLatLng(pickup);
    if (isValidPoint(dropoff)) return toLatLng(dropoff);
    return [33.3152, 44.3661];
  }, [pickup, dropoff]);

  const route = useMemo<LatLngExpression[]>(() => {
    if (!isValidPoint(pickup) || !isValidPoint(dropoff)) return [];
    return [toLatLng(pickup), toLatLng(dropoff)];
  }, [pickup, dropoff]);

  return (
    <div className="ride-map-frame" style={{ height }}>
      <MapContainer
        center={initialCenter}
        zoom={13}
        className="ride-map"
        scrollWheelZoom
      >
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} maxZoom={19} />

        <MapSelection enabled={editable} onSelect={onSelect} />
        <MapViewport
          pickup={pickup}
          dropoff={dropoff}
          driverLocation={driverLocation}
        />

        {isValidPoint(pickup) ? (
          <Marker position={toLatLng(pickup)} icon={pickupIcon}>
            <Popup>
              <div className="map-popup" dir="rtl">
                <strong>نقطة الانطلاق</strong>
                <span>{pickup.label || "موقع الانطلاق"}</span>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {isValidPoint(dropoff) ? (
          <Marker position={toLatLng(dropoff)} icon={dropoffIcon}>
            <Popup>
              <div className="map-popup" dir="rtl">
                <strong>الوجهة</strong>
                <span>{dropoff.label || "موقع الوجهة"}</span>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {isValidPoint(driverLocation) ? (
          <Marker position={toLatLng(driverLocation)} icon={driverIcon}>
            <Popup>
              <div className="map-popup" dir="rtl">
                <strong>موقع السائق</strong>
                <span>{driverLocation.label || "آخر موقع معروف"}</span>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {route.length === 2 ? (
          <Polyline
            positions={route}
            pathOptions={{
              color: "#0b7a53",
              weight: 5,
              opacity: 0.85,
              dashArray: "10 9",
            }}
          />
        ) : null}
      </MapContainer>

      {editable ? (
        <div className="map-selection-hint">
          انقر على الخريطة لتحديد {selectionMode === "pickup" ? "الانطلاق" : "الوجهة"}
        </div>
      ) : null}
    </div>
  );
}
