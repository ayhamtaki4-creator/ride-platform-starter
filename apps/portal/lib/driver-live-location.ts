import { apiFetch } from "./api";

type RealtimeSocket = {
  connected?: boolean;
  emit: (event: string, payload: unknown) => void;
} | null | undefined;

const activeWatches = new Map<string, number>();

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

export function stopDriverLiveLocation(tripId: string) {
  const watchId = activeWatches.get(tripId);
  if (watchId == null || typeof navigator === "undefined") return;
  navigator.geolocation.clearWatch(watchId);
  activeWatches.delete(tripId);
}

export function isDriverLiveLocationActive(tripId: string) {
  return activeWatches.has(tripId);
}
