"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  isDriverLiveLocationActive,
  startDriverLiveLocation,
  stopDriverLiveLocation,
} from "@/lib/driver-live-location";

export function DriverLocationBroadcaster({ tripId, active }: { tripId: string; active: boolean }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [sharing, setSharing] = useState(() => isDriverLiveLocationActive(tripId));
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
      () => setSharing(true),
    );
  }, [active, socket, tripId]);

  useEffect(() => {
    if (active) start();
    else {
      stopDriverLiveLocation(tripId);
      setSharing(false);
    }
  }, [active, start, tripId]);

  function retry() {
    start();
  }

  return (
    <div className="driver-location-controls">
      <div className={`connection-badge ${sharing ? "is-online" : "is-offline"}`}>
        {sharing
          ? `مشاركة الموقع فعالة${isRealtimeConnected ? " · مباشر" : " · احتياطي"}`
          : active
            ? "يبدأ GPS تلقائيًا بعد تسجيل الوصول"
            : "التتبع غير مطلوب في هذه المرحلة"}
      </div>
      {error ? (
        <>
          <div className="notice error">{error}</div>
          <button className="button" type="button" onClick={retry}>إعادة محاولة تشغيل GPS</button>
        </>
      ) : null}
    </div>
  );
}
