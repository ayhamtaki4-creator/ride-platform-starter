"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  DriverLocationDelivery,
  isDriverLiveLocationActive,
  shouldDriverAutoTrack,
  startDriverLiveLocation,
  stopDriverLiveLocation,
} from "@/lib/driver-live-location";

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function deliveryAge(timestamp: number | null, now: number) {
  if (!timestamp) return "بانتظار أول إرسال مؤكد";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 6) return "تم الإرسال الآن";
  if (seconds < 60) return `آخر إرسال مؤكد منذ ${seconds} ثانية`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `آخر إرسال مؤكد منذ ${minutes} دقيقة`;
}

export function DriverLocationBroadcaster({ tripId, active }: { tripId: string; active: boolean }) {
  const { socket, isRealtimeConnected } = useAuth();
  const [sharing, setSharing] = useState(() => isDriverLiveLocationActive(tripId));
  const [autoRequested, setAutoRequested] = useState(() => shouldDriverAutoTrack(tripId));
  const [error, setError] = useState("");
  const [lastDeliveredAt, setLastDeliveredAt] = useState<number | null>(null);
  const [lastTransport, setLastTransport] = useState<DriverLocationDelivery["transport"] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);

  const start = useCallback(() => {
    if (!active) return;
    setError("");
    startDriverLiveLocation(
      tripId,
      socket,
      (message) => {
        setSharing(isDriverLiveLocationActive(tripId));
        setError(message);
      },
      () => {
        setAutoRequested(true);
        setSharing(true);
      },
      (delivery) => {
        setSharing(true);
        setError("");
        setLastDeliveredAt(Date.parse(delivery.deliveredAt));
        setLastTransport(delivery.transport);
        setNow(Date.now());
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

  useEffect(() => {
    if (!sharing) return;
    const interval = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, [sharing]);

  useEffect(() => {
    const navigatorWithWakeLock = navigator as NavigatorWithWakeLock;
    const supported = Boolean(navigatorWithWakeLock.wakeLock?.request);
    setWakeLockSupported(supported);
    if (!sharing || !supported) {
      setWakeLockActive(false);
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible" || sentinel && !sentinel.released) return;
      try {
        sentinel = await navigatorWithWakeLock.wakeLock!.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        setWakeLockActive(true);
        sentinel.addEventListener?.("release", () => setWakeLockActive(false));
      } catch {
        setWakeLockActive(false);
      }
    };

    const visibilityChanged = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      void sentinel?.release().catch(() => undefined);
      setWakeLockActive(false);
    };
  }, [sharing]);

  return (
    <div className="driver-location-controls">
      <div className={`connection-badge ${sharing ? "is-online" : "is-offline"}`}>
        {sharing
          ? `مشاركة الموقع فعالة${isRealtimeConnected ? " · مباشر" : " · احتياطي"}`
          : autoRequested
            ? "جارٍ تشغيل GPS تلقائيًا"
            : "يبدأ GPS تلقائيًا عند الضغط على «وصلت إلى المسافر»"}
      </div>

      {sharing ? (
        <div className="tracking-delivery-health" aria-live="polite">
          <strong>{deliveryAge(lastDeliveredAt, now)}</strong>
          <small>
            {lastTransport === "realtime"
              ? "تم التأكيد عبر الاتصال المباشر"
              : lastTransport === "rest"
                ? "تم التأكيد عبر الاتصال الاحتياطي"
                : "سيظهر هنا تأكيد استلام الموقع من الخادم"}
          </small>
          <small>
            {wakeLockSupported
              ? wakeLockActive
                ? "إبقاء الشاشة مستيقظة مفعّل أثناء التتبع"
                : "قد يوقف الهاتف التتبع إذا أُغلقت الشاشة؛ أبقِ الصفحة في الواجهة"
              : "أبقِ الصفحة مفتوحة والشاشة قيد التشغيل لضمان استمرار GPS"}
          </small>
        </div>
      ) : null}

      {error ? (
        <div className="notice error">
          {error}
          {active && autoRequested ? (
            <button className="button" type="button" onClick={start}>إعادة تشغيل GPS</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
