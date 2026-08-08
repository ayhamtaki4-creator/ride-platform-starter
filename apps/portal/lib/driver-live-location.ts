import { apiFetch } from "./api";

type LocationPayload = {
  tripId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  recordedAt: string;
};

type LocationAccepted = LocationPayload & {
  driverId?: string;
};

type RealtimeSocket = {
  connected?: boolean;
  emit: (event: string, payload: unknown) => void;
  on: (event: string, listener: (payload: LocationAccepted) => void) => void;
  off: (event: string, listener: (payload: LocationAccepted) => void) => void;
} | null | undefined;

export type DriverLocationDelivery = {
  deliveredAt: string;
  recordedAt: string;
  transport: "realtime" | "rest";
};

type ActiveWatch = {
  watchId: number;
  socket?: RealtimeSocket;
  onError?: (message: string) => void;
  onStarted?: () => void;
  onDelivered?: (delivery: DriverLocationDelivery) => void;
  startedNotified: boolean;
  sending: boolean;
  lastAttemptAt: number;
  lastDeliveredAt: number;
  lastPosition: { latitude: number; longitude: number } | null;
};

const activeWatches = new Map<string, ActiveWatch>();
const AUTO_TRACK_PREFIX = "ride_driver_auto_track:";
const MIN_SEND_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_MS = 20_000;
const MIN_MOVEMENT_METERS = 8;
const REALTIME_ACK_TIMEOUT_MS = 4_000;

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

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLon = toRadians(second.longitude - first.longitude);
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shouldSendPosition(state: ActiveWatch, position: GeolocationPosition) {
  const now = Date.now();
  if (!state.lastPosition) return true;

  const elapsedSinceAttempt = now - state.lastAttemptAt;
  if (elapsedSinceAttempt < MIN_SEND_INTERVAL_MS) return false;

  const moved = distanceMeters(state.lastPosition, {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
  const elapsedSinceDelivery = state.lastDeliveredAt ? now - state.lastDeliveredAt : Number.POSITIVE_INFINITY;
  return moved >= MIN_MOVEMENT_METERS || elapsedSinceDelivery >= MAX_HEARTBEAT_MS;
}

function sendRealtimeWithConfirmation(
  socket: NonNullable<RealtimeSocket>,
  payload: LocationPayload,
) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("trip.location.accepted", accepted);
      resolve(success);
    };
    const accepted = (event: LocationAccepted) => {
      if (event.tripId !== payload.tripId || event.recordedAt !== payload.recordedAt) return;
      finish(true);
    };
    const timer = window.setTimeout(() => finish(false), REALTIME_ACK_TIMEOUT_MS);
    socket.on("trip.location.accepted", accepted);
    socket.emit("trip.location.update", payload);
  });
}

async function deliverPosition(tripId: string, payload: LocationPayload) {
  const state = activeWatches.get(tripId);
  if (!state || state.sending) return;
  state.sending = true;

  try {
    let transport: DriverLocationDelivery["transport"] = "rest";
    let delivered = false;
    const socket = state.socket;

    if (socket?.connected) {
      delivered = await sendRealtimeWithConfirmation(socket, payload);
      if (delivered) transport = "realtime";
    }

    if (!delivered) {
      await apiFetch(`/tracking/trips/${tripId}/location`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      transport = "rest";
    }

    state.lastDeliveredAt = Date.now();
    state.onDelivered?.({
      deliveredAt: new Date(state.lastDeliveredAt).toISOString(),
      recordedAt: payload.recordedAt,
      transport,
    });
  } catch (caught) {
    state.onError?.(
      caught instanceof Error
        ? `تعذر إرسال الموقع: ${caught.message}`
        : "تعذر إرسال الموقع. سنحاول تلقائيًا مرة أخرى.",
    );
  } finally {
    const current = activeWatches.get(tripId);
    if (current) current.sending = false;
  }
}

export function startDriverLiveLocation(
  tripId: string,
  socket?: RealtimeSocket,
  onError?: (message: string) => void,
  onStarted?: () => void,
  onDelivered?: (delivery: DriverLocationDelivery) => void,
) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError?.("هذا الجهاز لا يدعم تحديد الموقع.");
    return false;
  }

  requestDriverAutoTracking(tripId);
  const existing = activeWatches.get(tripId);
  if (existing) {
    existing.socket = socket;
    existing.onError = onError;
    existing.onStarted = onStarted;
    existing.onDelivered = onDelivered;
    onStarted?.();
    return true;
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const state = activeWatches.get(tripId);
      if (!state) return;
      if (!state.startedNotified) {
        state.startedNotified = true;
        state.onStarted?.();
      }
      if (!shouldSendPosition(state, position) || state.sending) return;

      const now = Date.now();
      state.lastAttemptAt = now;
      state.lastPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      const payload: LocationPayload = {
        tripId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading ?? undefined,
        speed: position.coords.speed ?? undefined,
        recordedAt: new Date(position.timestamp).toISOString(),
      };
      void deliverPosition(tripId, payload);
    },
    (error) => {
      const state = activeWatches.get(tripId);
      activeWatches.delete(tripId);
      state?.onError?.(
        error.code === error.PERMISSION_DENIED
          ? "يجب السماح للموقع من إعدادات المتصفح حتى يعمل التتبع المباشر."
          : error.message || "تعذر الحصول على موقع الجهاز.",
      );
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
  );

  activeWatches.set(tripId, {
    watchId,
    socket,
    onError,
    onStarted,
    onDelivered,
    startedNotified: false,
    sending: false,
    lastAttemptAt: 0,
    lastDeliveredAt: 0,
    lastPosition: null,
  });
  return true;
}

export function stopDriverLiveLocation(tripId: string, clearAutoTracking = false) {
  const state = activeWatches.get(tripId);
  if (state && typeof navigator !== "undefined") {
    navigator.geolocation.clearWatch(state.watchId);
    activeWatches.delete(tripId);
  }
  if (clearAutoTracking && typeof window !== "undefined") {
    localStorage.removeItem(trackingKey(tripId));
  }
}

export function isDriverLiveLocationActive(tripId: string) {
  return activeWatches.has(tripId);
}
