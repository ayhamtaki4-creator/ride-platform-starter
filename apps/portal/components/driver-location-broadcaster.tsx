"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  isDriverLiveLocationActive,
  shouldDriverAutoTrack,
  startDriverLiveLocation,
  stopDriverLiveLocation,
} from "@/lib/driver-live-location";

export function DriverLocationBroadcaster({ tripId, active }: { tripId: string; active: boolean }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [sharing, setSharing] = useState(() => isDriverLiveLocationActive(tripId));
  const [autoRequested, setAutoRequested] = useState(() => shouldDriverAutoTrack(tripId));
  const [error, setError] = useState("");

  const start = useCallback(() => {
    if (!active) return;
    setError("");
    startDriverLiveLocation(
      tripId,
      socket,
      (message) => {
        setSharing(false);
        setError(message);
      },
      () => {
        setAutoRequested(true);
        setSharing(true);
      },
    );
  }, [active, socket, tripId]);

  useEffect(() => {
    if (active && shouldDriverAutoTrack(tripId)) {
      setAutoRequested(true);
      start();
    } else if (!active) {
      stopDriverLiveLocation(tripId, true);
      setAutoRequested(false);
      setSharing(false);
    }
  }, [active, start, tripId]);

  return (
    <div className="driver-location-controls">
      <div className={`connection-badge ${sharing ? "is-online" : "is-offline"}`}>
        {sharing
          ? `مشاركة الموقع فعالة${isRealtimeConnected ? " · مباشر" : " · احتياطي"}`
          : autoRequested
            ? "جارٍ تشغيل GPS تلقائيًا"
            : "يبدأ GPS تلقائيًا عند الضغط على «وصلت إلى المسافر»"}
      </div>
      {error ? <div className="notice error">{error}</div> : null}
    </div>
  );
}
