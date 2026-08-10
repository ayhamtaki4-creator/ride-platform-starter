"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import {
  DriverAvailabilityRealtimeEvent,
  ServiceRun,
  ServiceRunRealtimeEvent,
  Trip,
  TripRealtimeEvent,
} from "@/lib/types";

export type DriverProfile = {
  id: string;
  status: string;
  availability: "OFFLINE" | "ONLINE" | "ON_TRIP";
  rating: number;
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    color: string;
    plateNumber: string;
    seatCapacity: number;
  }>;
};

export type DriverReviewSummary = {
  rating: number;
  reviewCount: number;
  reviews: Array<{
    id: string;
    tripId: string;
    bookingReference?: string | null;
    completedAt?: string | null;
    rating: number;
    comment?: string | null;
    createdAt: string;
  }>;
};

export function useDriverData() {
  const { socket, isRealtimeConnected } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [reviewSummary, setReviewSummary] = useState<DriverReviewSummary | null>(null);
  const [schedule, setSchedule] = useState<Trip[]>([]);
  const [runs, setRuns] = useState<ServiceRun[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [driverProfile, trips, serviceRuns, reviews] = await Promise.all([
        apiFetch<DriverProfile>("/drivers/me"),
        apiFetch<Trip[]>("/drivers/me/schedule"),
        apiFetch<ServiceRun[]>("/drivers/me/runs"),
        apiFetch<DriverReviewSummary>("/drivers/me/reviews?limit=10"),
      ]);
      setProfile(driverProfile);
      setSchedule(trips);
      setRuns(serviceRuns);
      setReviewSummary(reviews);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل بيانات السائق.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 30000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const refreshTrip = (_event?: TripRealtimeEvent) => void loadData();
    const refreshRun = (_event?: ServiceRunRealtimeEvent) => void loadData();
    const refreshAvailability = (_event?: DriverAvailabilityRealtimeEvent) => void loadData();

    socket.on("driver.trip.assigned", refreshTrip);
    socket.on("driver.trip.updated", refreshTrip);
    socket.on("driver.trip.unassigned", refreshTrip);
    socket.on("driver.run.assigned", refreshRun);
    socket.on("driver.run.updated", refreshRun);
    socket.on("driver.run.unassigned", refreshRun);
    socket.on("driver.availability.updated", refreshAvailability);

    return () => {
      socket.off("driver.trip.assigned", refreshTrip);
      socket.off("driver.trip.updated", refreshTrip);
      socket.off("driver.trip.unassigned", refreshTrip);
      socket.off("driver.run.assigned", refreshRun);
      socket.off("driver.run.updated", refreshRun);
      socket.off("driver.run.unassigned", refreshRun);
      socket.off("driver.availability.updated", refreshAvailability);
    };
  }, [loadData, socket]);

  return {
    profile,
    reviewSummary,
    schedule,
    runs,
    error,
    isLoading,
    isRealtimeConnected,
    reload: loadData,
  };
}
