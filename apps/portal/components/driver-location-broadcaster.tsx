"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { apiFetch } from "@/lib/api";

export function DriverLocationBroadcaster({ tripId, active }: { tripId: string; active: boolean }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active && watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharing(false);
    }
  }, [active]);

  useEffect(() => () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  function start() {
    if (!active) return;
    if (!("geolocation" in navigator)) {
      setError("هذا الجهاز لا يدعم مشاركة الموقع.");
      return;
    }
    if (watchId.current != null) return;

    setError("");
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const payload = {
          tripId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          recordedAt: new Date(position.timestamp).toISOString(),
        };
        if (socket?.connected) {
          socket.emit("trip.location.update", payload);
        } else {
          void apiFetch(`/tracking/trips/${tripId}/location`, {
            method: "POST",
            body: JSON.stringify(payload),
          }).catch(() => undefined);
        }
        setSharing(true);
      },
      (caught) => {
        setSharing(false);
        setError(caught.message || "تعذر الحصول على موقع الجهاز.");
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
  }

  function stop() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }

  return (
    <div className="driver-location-controls">
      <div className={`connection-badge ${sharing ? "is-online" : "is-offline"}`}>
        {sharing ? `مشاركة الموقع فعالة${isRealtimeConnected ? " · مباشر" : " · احتياطي"}` : "مشاركة الموقع متوقفة"}
      </div>
      <div className="actions">
        {!sharing ? <button className="button primary" type="button" disabled={!active} onClick={start}>بدء مشاركة موقعي</button> : <button className="button danger" type="button" onClick={stop}>إيقاف مشاركة الموقع</button>}
      </div>
      {error ? <div className="notice error">{error}</div> : null}
    </div>
  );
}
