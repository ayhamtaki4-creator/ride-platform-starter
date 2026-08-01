export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

export type TripStatus =
  | "SEARCHING_DRIVER"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ARRIVING"
  | "DRIVER_ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_PASSENGER"
  | "CANCELLED_BY_DRIVER"
  | "NO_DRIVER_AVAILABLE"
  | "PASSENGER_NO_SHOW"
  | "DRIVER_NO_SHOW";

export type Trip = {
  id: string;
  status: TripStatus;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFare: string | number;
  finalFare?: string | number | null;
  currency: string;
  requestedAt: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  startPin?: string;
  passenger?: {
    id?: string;
    firstName: string;
    lastName?: string;
    email?: string;
    rating?: number;
    passengerProfile?: { rating: number } | null;
  };
  driver?: {
    id?: string;
    firstName: string;
    lastName?: string;
    email?: string;
    driverProfile?: {
      rating: number;
      vehicles: Array<{
        make: string;
        model: string;
        color: string;
        plateNumber: string;
      }>;
    } | null;
  } | null;
  statusHistory?: Array<{
    id: string;
    from?: TripStatus | null;
    to: TripStatus;
    note?: string | null;
    createdAt: string;
  }>;
};

export const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  SEARCHING_DRIVER: "البحث عن سائق",
  DRIVER_ASSIGNED: "تم تعيين سائق",
  DRIVER_ARRIVING: "السائق في الطريق",
  DRIVER_ARRIVED: "السائق وصل",
  IN_PROGRESS: "الرحلة جارية",
  COMPLETED: "مكتملة",
  CANCELLED_BY_PASSENGER: "ألغيت من الراكب",
  CANCELLED_BY_DRIVER: "ألغيت من السائق",
  NO_DRIVER_AVAILABLE: "لا يوجد سائق",
  PASSENGER_NO_SHOW: "الراكب لم يحضر",
  DRIVER_NO_SHOW: "السائق لم يحضر",
};

export function homeForRoles(roles: string[]) {
  if (roles.some((role) => ["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"].includes(role))) return "/admin";
  if (roles.includes("DRIVER")) return "/driver";
  if (roles.includes("PASSENGER")) return "/rider";
  return "/";
}
