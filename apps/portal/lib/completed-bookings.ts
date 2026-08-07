import type { ServiceRun, Trip } from "./types";

const TERMINAL_TRIP_STATUSES = new Set<Trip["status"]>([
  "COMPLETED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "NO_DRIVER_AVAILABLE",
  "PASSENGER_NO_SHOW",
  "DRIVER_NO_SHOW",
]);

const TERMINAL_RUN_STATUSES = new Set<ServiceRun["status"]>([
  "COMPLETED",
  "CANCELLED",
]);

export function isTripEnded(trip: Trip) {
  return (
    TERMINAL_TRIP_STATUSES.has(trip.status) ||
    trip.bookingReviewStatus === "REJECTED" ||
    trip.bookingReviewStatus === "CANCELLED" ||
    trip.serviceRun?.status === "COMPLETED" ||
    trip.serviceRun?.status === "CANCELLED"
  );
}

export function isRunEnded(run: ServiceRun) {
  return TERMINAL_RUN_STATUSES.has(run.status);
}

export function sortTripsNewestFirst(trips: Trip[]) {
  return [...trips].sort((a, b) => {
    const aTime = new Date(a.requestedAt ?? a.travelDate ?? 0).getTime();
    const bTime = new Date(b.requestedAt ?? b.travelDate ?? 0).getTime();
    return bTime - aTime;
  });
}

export function sortRunsNewestFirst(runs: ServiceRun[]) {
  return [...runs].sort((a, b) => {
    const aTime = new Date(a.completedAt ?? a.cancelledAt ?? a.travelDate).getTime();
    const bTime = new Date(b.completedAt ?? b.cancelledAt ?? b.travelDate).getTime();
    return bTime - aTime;
  });
}
