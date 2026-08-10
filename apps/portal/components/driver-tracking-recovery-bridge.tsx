"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import {
  isDriverLiveLocationActive,
  refreshDriverLiveLocation,
  shouldDriverAutoTrack,
  startDriverLiveLocation,
  stopDriverLiveLocation,
} from "@/lib/driver-live-location";
import type { Trip } from "@/lib/types";

const AUTO_TRACK_PREFIX = "ride_driver_auto_track:";
const TRACKING_STATUSES = new Set<Trip["status"]>(["DRIVER_ARRIVED", "IN_PROGRESS"]);
const RESYNC_INTERVAL_MS = 30_000;

function requestedAutoTrackTripIds() {
  if (typeof window === "undefined") return [];

  const tripIds: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(AUTO_TRACK_PREFIX) || localStorage.getItem(key) !== "1") continue;
      const tripId = key.slice(AUTO_TRACK_PREFIX.length);
      if (tripId) tripIds.push(tripId);
    }
  } catch {
    return [];
  }
  return tripIds;
}

export function DriverTrackingRecoveryBridge() {
  const { socket, isRealtimeConnected } = useAuth();
  const syncing = useRef(false);

  const syncTracking = useCallback(async (refreshCurrent = false) => {
    if (syncing.current) return;
    syncing.current = true;

    try {
      const schedule = await apiFetch<Trip[]>("/drivers/me/schedule");
      const activeTrackingTripIds = new Set(
        schedule
          .filter((trip) => TRACKING_STATUSES.has(trip.status))
          .map((trip) => trip.id),
      );

      for (const storedTripId of requestedAutoTrackTripIds()) {
        if (!activeTrackingTripIds.has(storedTripId)) {
          stopDriverLiveLocation(storedTripId, true);
        }
      }

      for (const tripId of activeTrackingTripIds) {
        if (!shouldDriverAutoTrack(tripId)) continue;

        if (!isDriverLiveLocationActive(tripId)) {
          startDriverLiveLocation(tripId, socket);
          continue;
        }

        if (
          refreshCurrent &&
          typeof navigator !== "undefined" &&
          navigator.onLine &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          refreshDriverLiveLocation(tripId);
        }
      }
    } catch {
      // Keep the existing GPS watch and stored intent when the schedule cannot be verified.
    } finally {
      syncing.current = false;
    }
  }, [socket]);

  useEffect(() => {
    void syncTracking(true);
    const timer = window.setInterval(() => void syncTracking(false), RESYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [syncTracking]);

  useEffect(() => {
    const recoverVisibleTracking = () => {
      if (document.visibilityState === "visible") void syncTracking(true);
    };
    const recoverTracking = () => void syncTracking(true);

    document.addEventListener("visibilitychange", recoverVisibleTracking);
    window.addEventListener("focus", recoverTracking);
    window.addEventListener("pageshow", recoverTracking);
    window.addEventListener("online", recoverTracking);

    return () => {
      document.removeEventListener("visibilitychange", recoverVisibleTracking);
      window.removeEventListener("focus", recoverTracking);
      window.removeEventListener("pageshow", recoverTracking);
      window.removeEventListener("online", recoverTracking);
    };
  }, [syncTracking]);

  useEffect(() => {
    if (isRealtimeConnected) void syncTracking(true);
  }, [isRealtimeConnected, syncTracking]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void syncTracking(false);

    socket.on("driver.trip.assigned", refresh);
    socket.on("driver.trip.updated", refresh);
    socket.on("driver.trip.unassigned", refresh);
    socket.on("driver.run.updated", refresh);
    socket.on("run.started", refresh);
    socket.on("run.completed", refresh);

    return () => {
      socket.off("driver.trip.assigned", refresh);
      socket.off("driver.trip.updated", refresh);
      socket.off("driver.trip.unassigned", refresh);
      socket.off("driver.run.updated", refresh);
      socket.off("run.started", refresh);
      socket.off("run.completed", refresh);
    };
  }, [socket, syncTracking]);

  return null;
}
