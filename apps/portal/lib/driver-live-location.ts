import { apiFetch } from "./api";

type RealtimeSocket = {
  connected?: boolean;
  emit: (event: string, payload: unknown) => void;
} | null | undefined;

const activeWatches = new Map<string, number>();
const AUTO_TRACK_PREFIX = "ride_driver_auto_track:";

function trackingKey(tripId: string) {
  return `${AUTO_TRACK_PREFIX}${tripId}`;
}

export function shouldDriverAutoTrack(tripId: string) {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(trackingKey(tripId)) === "1";
}

export function requestDriverAutoTracking(tripId: string) {
  if (typeof window !== "undefined") localStorage.setItem(trackingKey(tripId), "1");
}

export function startDriverLiveLocation(
  tripId: string,
  socket?: RealtimeSocket,
  onError?: (message: string) => void,
  onStarted?: () => void,
) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError?.("هذا الجهاز لا يدعم تحديد الموقع.");
    return false;
  }
  requestDriverAutoTracking(tripId);
  if (activeWatches.has(tripId)) {
    onStarted?.();
    return true;
  }

  const watchId = navigator.geolocation.watchPosition(
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
      onStarted?.();
    },
    (error) => {
      activeWatches.delete(tripId);
      onError?.(
        error.code === error.PERMISSION_DENIED
          ? "يجب السماح للموقع من إعدادات المتصفح حتى يعمل التتبع المباشر."
          : error.message || "تعذر الحصول على موقع الجهاز.",
      );
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
  );

  activeWatches.set(tripId, watchId);
  return true;
}

export function stopDriverLiveLocation(tripId: string, clearAutoTracking = false) {
  const watchId = activeWatches.get(tripId);
  if (watchId != null && typeof navigator !== "undefined") {
    navigator.geolocation.clearWatch(watchId);
    activeWatches.delete(tripId);
  }
  if (clearAutoTracking && typeof window !== "undefined") {
    localStorage.removeItem(trackingKey(tripId));
  }
}

export function isDriverLiveLocationActive(tripId: string) {
  return activeWatches.has(tripId);
}
