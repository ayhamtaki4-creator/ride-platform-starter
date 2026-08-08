"use client";

import L, { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { searchPlace } from "@/lib/geocoding";

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
  onSelect: (point: { latitude: number; longitude: number }) => void | Promise<void>;
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
  onSelect,
}: {
  activeMode: "pickup" | "dropoff";
  onSelect: BookingLocationMapProps["onSelect"];
}) {
  useMapEvents({
    click(event) {
      void onSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
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

function SearchViewport({ point }: { point: BookingMapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.latitude, point.longitude], 16);
  }, [map, point]);
  return null;
}

export default function BookingLocationMap({
  pickup,
  dropoff,
  activeMode,
  fitKey,
  onSelect,
}: BookingLocationMapProps) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchPoint, setSearchPoint] = useState<BookingMapPoint | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  async function search() {
    const normalized = query.trim();
    if (!normalized || searching) return;
    setSearching(true);
    setSearchError("");
    try {
      const result = await searchPlace(normalized);
      setSearchPoint(result);
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : "تعذر البحث عن الموقع.");
    } finally {
      setSearching(false);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    void search();
  }

  async function chooseSearchResult() {
    if (!searchPoint) return;
    await onSelect({ latitude: searchPoint.latitude, longitude: searchPoint.longitude });
    setSearchPoint(null);
    setQuery("");
  }

  const fallback: LatLngExpression = [33.5138, 36.2765];
  const center: LatLngExpression = pickup
    ? [pickup.latitude, pickup.longitude]
    : dropoff
      ? [dropoff.latitude, dropoff.longitude]
      : fallback;
  const points: LatLngExpression[] = [];
  if (pickup) points.push([pickup.latitude, pickup.longitude]);
  if (dropoff) points.push([dropoff.latitude, dropoff.longitude]);

  if (!mounted) return null;
  if (!open) {
    return (
      <div className="booking-map-reopen-card">
        <div>
          <strong>الموقع محدد عبر الخريطة</strong>
          <small>يمكنك فتح الخريطة مرة أخرى لتعديل النقطة.</small>
        </div>
        <button className="button" type="button" onClick={() => setOpen(true)}>فتح الخريطة</button>
      </div>
    );
  }

  return createPortal(
    <div className="booking-map-modal-backdrop" role="presentation" onClick={(event) => event.stopPropagation()}>
      <section className="booking-map-modal" role="dialog" aria-modal="true" aria-label="تحديد موقع الرحلة على الخريطة" onClick={(event) => event.stopPropagation()}>
        <header className="booking-map-modal-header">
          <div>
            <strong>{activeMode === "pickup" ? "حدد نقطة الانطلاق" : "حدد نقطة الوصول"}</strong>
            <small>ابحث عن المكان أو حرّك الخريطة واضغط على النقطة الدقيقة.</small>
          </div>
          <button className="booking-map-modal-close" type="button" aria-label="إغلاق الخريطة" onClick={() => setOpen(false)}>×</button>
        </header>

        <div className="booking-map-search" role="search">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="ابحث عن حي، شارع، فندق أو مطار..."
            autoComplete="off"
          />
          <button className="button primary" disabled={searching || !query.trim()} type="button" onClick={() => void search()}>{searching ? "جارٍ البحث..." : "بحث"}</button>
        </div>
        {searchError ? <div className="notice error compact-notice">{searchError}</div> : null}
        {searchPoint ? (
          <div className="booking-map-search-result">
            <div><strong>{searchPoint.label}</strong><small>{searchPoint.latitude.toFixed(5)}, {searchPoint.longitude.toFixed(5)}</small></div>
            <button className="button primary" type="button" onClick={() => void chooseSearchResult()}>
              {activeMode === "pickup" ? "تعيين كنقطة انطلاق" : "تعيين كنقطة وصول"}
            </button>
          </div>
        ) : null}

        <div className="booking-map-modal-map">
          <MapContainer center={center} zoom={11} className="ride-map" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <InitialViewport points={points} fitKey={fitKey} />
            <SearchViewport point={searchPoint} />
            <PickerEvents activeMode={activeMode} onSelect={onSelect} />
            {pickup ? (
              <Marker position={[pickup.latitude, pickup.longitude]} icon={pickupIcon}>
                <Popup><div dir="rtl"><strong>نقطة الانطلاق</strong>{pickup.label ? <><br />{pickup.label}</> : null}</div></Popup>
              </Marker>
            ) : null}
            {dropoff ? (
              <Marker position={[dropoff.latitude, dropoff.longitude]} icon={dropoffIcon}>
                <Popup><div dir="rtl"><strong>نقطة الوصول</strong>{dropoff.label ? <><br />{dropoff.label}</> : null}</div></Popup>
              </Marker>
            ) : null}
            {searchPoint ? <Marker position={[searchPoint.latitude, searchPoint.longitude]} /> : null}
            {pickup && dropoff ? (
              <Polyline positions={[[pickup.latitude, pickup.longitude], [dropoff.latitude, dropoff.longitude]]} pathOptions={{ weight: 4, opacity: 0.7, dashArray: "8 8" }} />
            ) : null}
          </MapContainer>
        </div>

        <footer className="booking-map-modal-footer">
          <span>{activeMode === "pickup" ? "اضغط على مكان الانطلاق الدقيق" : "اضغط على مكان الوصول الدقيق"}</span>
          <button className="button" type="button" onClick={() => setOpen(false)}>تم</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
