"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { Trip } from "@/lib/types";

export function useRiderBookings() {
  const { socket, isRealtimeConnected } = useAuth();
  const [bookings, setBookings] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (background = false) => {
    if (background) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await apiFetch<Trip[]>("/bookings/me");
      setBookings(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الحجوزات.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => void load(true);
    const events = [
      "rider.booking.updated",
      "rider.trip.updated",
      "rider.run.updated",
      "run.updated",
      "run.driver.accepted",
      "run.passenger.updated",
      "run.started",
      "run.completed",
    ];

    events.forEach((event) => socket.on(event, refresh));
    return () => events.forEach((event) => socket.off(event, refresh));
  }, [load, socket]);

  return {
    bookings,
    isLoading,
    isRefreshing,
    isRealtimeConnected,
    error,
    reload: () => load(true),
  };
}
