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

type LocationConfirmation = {
  tripId: string;
  recordedAt: string;
  accepted?: boolean;
  ignoredStale?: boolean;
  throttled?: boolean;
  retryAfterMs?: number;
};

type RealtimeSocket = {
  connected?: boolean;
  emit: (event: string, payload: unknown) => void;
  on: (event: string, listener: (payload: LocationConfirmation) => void) => void;
  off: (event: string, listener: (payload: LocationConfirmation) => void) => void;
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
  lastRefreshAt: number;
  lastPosition: { latitude: number; longitude: number } | null;
};

type RealtimeConfirmationResult = "accepted" | "ignored" | "throttled" | "timeout";

const activeWatches = new Map<string, ActiveWatch>();
const AUTO_TRACK_PREFIX = "ride_driver_auto_track:";
const MIN_SEND_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_MS = 20_000;
const MIN_MOVEMENT_METERS = 8;
const REALTIME_ACK_TIMEOUT_MS = 4_000;
const MIN_RECOVERY_REFRESH_INTERVAL_MS = 2_500;

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
  const elapsedSinceDelivery = state.lastDeliveredAt
    ? now - state.lastDeliveredAt
    : Number.POSITIVE_INFINITY;
  return moved >= MIN_MOVEMENT_METERS || elapsedSinceDelivery >= MAX_HEARTBEAT_MS;
}

function confirmationResult(event: LocationConfirmation): Exclude<RealtimeConfirmationResult, "timeout"> {
  if (event.throttled) return "throttled";
  if (event.accepted === false || event.ignoredStale) return "ignored";
  return "accepted";
}

function sendRealtimeWithConfirmation(
  socket: NonNullable<RealtimeSocket>,
  payload: LocationPayload,
) {
  return new Promise<RealtimeConfirmationResult>((resolve) => {
    let settled = false;
    const finish = (result: RealtimeConfirmationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("trip.location.accepted", accepted);
      resolve(result);
    };
    const accepted = (event: LocationConfirmation) => {
      if (event.tripId !== payload.tripId || event.recordedAt !== payload.recordedAt) return;
      finish(confirmationResult(event));
    };
    const timer = window.setTimeout(() => finish("timeout"), REALTIME_ACK_TIMEOUT_MS);
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
      const realtimeResult = await sendRealtimeWithConfirmation(socket, payload);
      if (realtimeResult === "accepted") {
        delivered = true;
        transport = "realtime";
      } else if (realtimeResult === "ignored" || realtimeResult === "throttled") {
        return;
      }
    }

    if (!delivered) {
      const response = await apiFetch<LocationConfirmation>(`/tracking/trips/${tripId}/location`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (response?.throttled || response?.accepted === false || response?.ignoredStale) return;
      transport = "rest";
    }

    const current = activeWatches.get(tripId);
    if (!current) return;
    current.lastDeliveredAt = Date.now();
    current.onDelivered?.({
      deliveredAt: new Date(current.lastDeliveredAt).toISOString(),
      recordedAt: payload.recordedAt,
      transport,
    });
  } catch (caught) {
    const current = activeWatches.get(tripId);
    current?.onError?.(
      caught instanceof Error
        ? `تعذر إرسال الموقع: ${caught.message}`
        : "تعذر إرسال الموقع. سنحاول تلقائيًا مرة أخرى.",
    );
  } finally {
    const current = activeWatches.get(tripId);
    if (current) current.sending = false;
  }
}

function handlePosition(tripId: string, position: GeolocationPosition, force = false) {
  const state = activeWatches.get(tripId);
  if (!state || state.sending) return;
  if (!force && !shouldSendPosition(state, position)) return;

  if (!state.startedNotified) {
    state.startedNotified = true;
    state.onStarted?.();
  }

  state.lastAttemptAt = Date.now();
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
}

function locationErrorMessage(error: GeolocationPositionError) {
  return error.code === error.PERMISSION_DENIED
    ? "يجب السماح للموقع من إعدادات المتصفح حتى يعمل التتبع المباشر."
    : error.message || "تعذر الحصول على موقع الجهاز.";
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
    (position) => handlePosition(tripId, position),
    (error) => {
      const state = activeWatches.get(tripId);
      if (state) navigator.geolocation.clearWatch(state.watchId);
      activeWatches.delete(tripId);
      state?.onError?.(locationErrorMessage(error));
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
    lastRefreshAt: 0,
    lastPosition: null,
  });
  return true;
}

export function refreshDriverLiveLocation(tripId: string) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return false;
  const state = activeWatches.get(tripId);
  if (!state) return false;

  const now = Date.now();
  if (state.sending || now - state.lastRefreshAt < MIN_RECOVERY_REFRESH_INTERVAL_MS) return false;
  state.lastRefreshAt = now;

  navigator.geolocation.getCurrentPosition(
    (position) => handlePosition(tripId, position, true),
    (error) => {
      const current = activeWatches.get(tripId);
      if (error.code === error.PERMISSION_DENIED) {
        current?.onError?.(locationErrorMessage(error));
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
  );
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
