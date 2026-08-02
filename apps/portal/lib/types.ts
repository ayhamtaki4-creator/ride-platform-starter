export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
};

export type LoginResponse = { accessToken: string; user: AuthUser };

export type TripStatus =
  | "PENDING_DISPATCH"
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

export type BookingDirection =
  | "BEIRUT_AIRPORT_TO_DAMASCUS"
  | "DAMASCUS_TO_BEIRUT_AIRPORT";

export type BookingType = "SHARED_SEAT" | "PRIVATE_CAR";
export type BookingReviewStatus = "NEW" | "CONFIRMED" | "REJECTED" | "CANCELLED";
export type DriverAssignmentStatus =
  | "UNASSIGNED"
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED";

export type ServiceRunStatus =
  | "DRAFT"
  | "PLANNED"
  | "SCHEDULED"
  | "DRIVER_PENDING"
  | "DRIVER_ACCEPTED"
  | "BOARDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "DRIVER_REPLACEMENT_REQUIRED";

export type ServiceRunPassengerStatus =
  | "WAITING"
  | "PICKED_UP"
  | "NO_SHOW"
  | "DROPPED_OFF";

export type Trip = {
  id: string;
  status: TripStatus;
  bookingReviewStatus?: BookingReviewStatus;
  driverAssignmentStatus?: DriverAssignmentStatus;
  bookingReference?: string | null;
  direction?: BookingDirection | null;
  routeId?: string | null;
  route?: {
    id: string;
    code: string;
    nameAr: string;
    requiresFlightDetails?: boolean;
    origin: { id: string; code: string; nameAr: string };
    destination: { id: string; code: string; nameAr: string };
    requiredRegions?: Array<{ region: { id: string; code: string; nameAr: string } }>;
  } | null;
  bookingType?: BookingType | null;
  travelDate?: string | null;
  flightArrivalTime?: string | null;
  flightNumber?: string | null;
  passengerCount?: number;
  luggageCount?: number;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFare: string | number;
  driverFee?: string | number;
  platformMargin?: string | number;
  finalFare?: string | number | null;
  currency: string;
  requestedAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  assignedAt?: string | null;
  driverRespondedAt?: string | null;
  driverRejectionReason?: string | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  passenger?: {
    id?: string;
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    rating?: number;
    passengerProfile?: { rating: number } | null;
  };
  driver?: {
    id?: string;
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    driverProfile?: {
      rating: number;
      vehicles: Array<{
        id?: string;
        make: string;
        model: string;
        year?: number;
        color: string;
        plateNumber: string;
        maskedPlateNumber?: string;
        seatCapacity?: number;
        primaryImageUrl?: string | null;
        images?: string[];
      }>;
    } | null;
  } | null;
  serviceRunPassengerStatus?: ServiceRunPassengerStatus;
  pickupOrder?: number | null;
  pickedUpAt?: string | null;
  noShowAt?: string | null;
  droppedOffAt?: string | null;
  serviceRun?: {
    id: string;
    runReference: string;
    direction?: BookingDirection | null;
    routeId?: string | null;
    route?: { id: string; code: string; nameAr: string } | null;
    bookingType: BookingType;
    travelDate: string;
    status: ServiceRunStatus;
    seatCapacity: number;
    reservedSeats: number;
    vehicle: {
      id?: string;
      make: string;
      model: string;
      year?: number;
      color: string;
      plateNumber: string;
      maskedPlateNumber?: string;
      seatCapacity: number;
      primaryImageUrl?: string | null;
      images?: string[];
    } | null;
    bookings: Array<{
      id: string;
      bookingReference?: string | null;
      passengerCount: number;
      luggageCount: number;
      contactName?: string | null;
      contactPhone?: string | null;
      pickupAddress?: string;
      dropoffAddress?: string;
      driverAssignmentStatus: DriverAssignmentStatus;
      status?: TripStatus;
    }>;
  } | null;
  driverPublicProfile?: {
    userId: string;
    displayName: string;
    phone?: string | null;
    avatarUrl?: string | null;
    rating?: number | null;
    completedTrips: number;
    baseRegion?: { id: string; code: string; nameAr: string } | null;
    vehicle?: {
      id: string;
      make: string;
      model: string;
      year: number;
      color: string;
      plateNumber: string;
      maskedPlateNumber: string;
      seatCapacity: number;
      primaryImageUrl?: string | null;
      images: string[];
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

export type PricingRule = {
  id: string;
  routeId?: string | null;
  direction?: BookingDirection | null;
  route?: {
    id: string;
    code: string;
    nameAr: string;
    origin: { id: string; code: string; nameAr: string };
    destination: { id: string; code: string; nameAr: string };
  } | null;
  bookingType: BookingType;
  passengerPrice: string | number;
  driverFee: string | number;
  platformMargin: string | number;
  currency: string;
  isActive: boolean;
};

export type BookingQuote = {
  pricingRuleId: string;
  routeId?: string | null;
  route?: {
    id: string;
    code: string;
    nameAr: string;
    requiresFlightDetails?: boolean;
    origin: { id: string; code: string; nameAr: string };
    destination: { id: string; code: string; nameAr: string };
  } | null;
  direction?: BookingDirection | null;
  bookingType: BookingType;
  passengerCount: number;
  unitPassengerPrice: number;
  passengerPrice: number;
  driverFee: number;
  platformMargin: number;
  currency: string;
};

export const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  "PENDING_DISPATCH",
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PENDING_DISPATCH: "بانتظار تعيين سائق",
  SEARCHING_DRIVER: "بانتظار تعيين سائق",
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

export const BOOKING_REVIEW_LABELS: Record<BookingReviewStatus, string> = {
  NEW: "طلب جديد",
  CONFIRMED: "تم تأكيد الحجز",
  REJECTED: "مرفوض",
  CANCELLED: "ملغى",
};

export const DIRECTION_LABELS: Record<BookingDirection, string> = {
  BEIRUT_AIRPORT_TO_DAMASCUS: "مطار بيروت → دمشق",
  DAMASCUS_TO_BEIRUT_AIRPORT: "دمشق → مطار بيروت",
};

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  SHARED_SEAT: "مقعد في سيارة مشتركة",
  PRIVATE_CAR: "سيارة خاصة",
};

export function homeForRoles(roles: string[]) {
  if (roles.some((role) => ["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"].includes(role))) return "/admin";
  if (roles.includes("DRIVER")) return "/driver";
  if (roles.includes("PASSENGER")) return "/rider";
  return "/";
}

export type TripRealtimeEvent = {
  tripId: string;
  passengerId: string;
  driverId?: string | null;
  previousDriverId?: string | null;
  status: TripStatus;
  bookingStatus?: BookingReviewStatus;
  bookingReference?: string | null;
  occurredAt: string;
  reason?: string | null;
};

export type DriverAvailabilityRealtimeEvent = {
  driverId: string;
  availability: "OFFLINE" | "ONLINE" | "ON_TRIP";
  occurredAt: string;
};

export const DRIVER_ASSIGNMENT_LABELS: Record<DriverAssignmentStatus, string> = {
  UNASSIGNED: "غير معيّن",
  PENDING: "بانتظار رد السائق",
  ACCEPTED: "قبله السائق",
  REJECTED: "رفضه السائق",
};

export const SERVICE_RUN_STATUS_LABELS: Record<ServiceRunStatus, string> = {
  DRAFT: "مسودة",
  PLANNED: "مخطط",
  SCHEDULED: "مجدولة بانتظار قبول السائق",
  DRIVER_PENDING: "بانتظار السائق",
  DRIVER_ACCEPTED: "مؤكدة من السائق",
  BOARDING: "صعود الركاب",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
  DRIVER_REPLACEMENT_REQUIRED: "تحتاج إلى سائق بديل",
};

export const SERVICE_RUN_PASSENGER_STATUS_LABELS: Record<
  ServiceRunPassengerStatus,
  string
> = {
  WAITING: "بانتظار الصعود",
  PICKED_UP: "صعد إلى المركبة",
  NO_SHOW: "لم يحضر",
  DROPPED_OFF: "تم إنزاله",
};


export type ServiceRunBooking = Trip & {
  serviceRunPassengerStatus: ServiceRunPassengerStatus;
  pickupOrder?: number | null;
};

export type ServiceRun = {
  id: string;
  runReference: string;
  direction?: BookingDirection | null;
  routeId?: string | null;
  route?: {
    id: string;
    code: string;
    nameAr: string;
    origin?: { id: string; code: string; nameAr: string };
    destination?: { id: string; code: string; nameAr: string };
  } | null;
  bookingType: BookingType;
  travelDate: string;
  driverId: string;
  vehicleId: string;
  status: ServiceRunStatus;
  seatCapacity: number;
  reservedSeats: number;
  notes?: string | null;
  driverAcceptedAt?: string | null;
  boardingStartedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  driverRejectionReason?: string | null;
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string | null;
    driverProfile?: {
      rating: number;
      status: string;
      availability: string;
    } | null;
  };
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    color: string;
    plateNumber: string;
    seatCapacity: number;
  };
  bookings: ServiceRunBooking[];
  report: {
    bookingCount: number;
    passengerCount: number;
    luggageCount: number;
    grossRevenue: number;
    driverFees: number;
    platformMargin: number;
    occupancyPercent: number;
    waitingCount?: number;
    pickedUpCount?: number;
    noShowCount?: number;
    droppedOffCount?: number;
  };
};

export type ServiceRunRealtimeEvent = {
  runId: string;
  runReference: string;
  driverId: string;
  previousDriverId?: string | null;
  passengerIds: string[];
  status: ServiceRunStatus;
  occurredAt: string;
  reason?: string | null;
  bookingId?: string;
  passengerStatus?: ServiceRunPassengerStatus;
};
