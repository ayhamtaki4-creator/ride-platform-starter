export type RegionKind = "COUNTRY_ACCESS" | "OPERATING_HUB";
export type LocationType = "CITY" | "AIRPORT" | "GOVERNORATE" | "BORDER" | "STATION";
export type RouteType = "INTERCITY" | "INTERNATIONAL" | "AIRPORT_TRANSFER" | "PRIVATE_TRANSFER";
export type AccessStatus = "PENDING" | "APPROVED" | "EXPIRED" | "SUSPENDED" | "REJECTED";
export type DocumentStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "SUSPENDED";
export type ComplianceSubject = "DRIVER" | "VEHICLE";
export type MediaStatus = "PENDING" | "APPROVED" | "REJECTED" | "DELETED";
export type MediaPurpose = "DRIVER_AVATAR" | "VEHICLE_IMAGE" | "DRIVER_DOCUMENT" | "VEHICLE_DOCUMENT" | "FLIGHT_TICKET" | "OTHER";
export type MediaVisibility = "PUBLIC" | "PRIVATE";

export type ServiceRegion = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  countryCode: string;
  kind: RegionKind;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ServiceLocation = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  type: LocationType;
  countryCode: string;
  city?: string | null;
  governorate?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  isActive: boolean;
};

export type DynamicPricingRule = {
  id: string;
  routeId?: string | null;
  direction?: string | null;
  bookingType: "SHARED_SEAT" | "PRIVATE_CAR";
  vehicleClass: "SMALL" | "MEDIUM" | "LARGE";
  passengerPrice: string | number;
  driverFee: string | number;
  platformMargin: string | number;
  currency: string;
  isActive: boolean;
};

export type VehicleClassConfig = {
  vehicleClass: "SMALL" | "MEDIUM" | "LARGE";
  passengerCapacity: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ServiceRoute = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  originId: string;
  destinationId: string;
  routeType: RouteType;
  requiresFlightDetails: boolean;
  estimatedMinutes?: number | null;
  distanceKm?: string | number | null;
  isActive: boolean;
  origin: ServiceLocation;
  destination: ServiceLocation;
  requiredRegions: Array<{ regionId?: string; region: ServiceRegion }>;
  pricingRules: DynamicPricingRule[];
  bookingTypes: Array<"SHARED_SEAT" | "PRIVATE_CAR">;
  bookable: boolean;
  vehicleClasses?: VehicleClassConfig[];
};

export type MediaAsset = {
  id: string;
  originalName: string;
  storedName?: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  purpose: MediaPurpose;
  visibility: MediaVisibility;
  status: MediaStatus;
  rejectionReason?: string | null;
  publicUrl?: string | null;
  adminFileUrl: string;
  createdAt: string;
  uploadedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  approvedBy?: { id: string; firstName: string; lastName: string } | null;
};

export type ComplianceDocument = {
  id: string;
  documentType: string;
  documentNumber?: string | null;
  status: DocumentStatus;
  issuedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  region?: ServiceRegion | null;
  mediaAsset: MediaAsset;
  reviewedBy?: { id: string; firstName: string; lastName: string } | null;
};

export type RegionAccess = {
  id?: string;
  status: AccessStatus;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  region: ServiceRegion;
};

export type DriverVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string;
  seatCapacity: number;
  isActive: boolean;
  primaryImageUrl?: string | null;
  publicImageUrl?: string | null;
  baseRegion?: ServiceRegion | null;
  regionAccesses: RegionAccess[];
  documents: ComplianceDocument[];
  images: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
    isApproved: boolean;
    sortOrder: number;
    mediaAsset?: MediaAsset | null;
  }>;
};

export type DriverAdminRecord = {
  id: string;
  userId: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";
  availability: "OFFLINE" | "ONLINE" | "ON_TRIP";
  rating: number;
  licenseNumber?: string | null;
  avatarUrl?: string | null;
  avatarMedia?: MediaAsset | null;
  baseRegion?: ServiceRegion | null;
  regionAccesses: RegionAccess[];
  documents: ComplianceDocument[];
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    status: string;
    createdAt: string;
  };
  vehicles: DriverVehicle[];
  completedTrips: number;
  assignedBookings: number;
  upcomingRuns: Array<{
    id: string;
    runReference: string;
    route?: { id: string; code: string; nameAr: string } | null;
    direction?: string | null;
    bookingType: "SHARED_SEAT" | "PRIVATE_CAR";
    travelDate: string;
    status: string;
    reservedSeats: number;
    seatCapacity: number;
  }>;
};

export type ComplianceRequirement = {
  id: string;
  regionId: string;
  subject: ComplianceSubject;
  documentType: string;
  minValidityDays: number;
  regionScoped: boolean;
  isActive: boolean;
  region: ServiceRegion;
};

export type EligibleVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string;
  seatCapacity: number;
  primaryImageUrl?: string | null;
  images: string[];
  baseRegion?: ServiceRegion | null;
  compliance: { eligible: boolean; missing: unknown[] };
  regions: Array<{ code: string; nameAr: string; status: AccessStatus; validUntil?: string | null }>;
};

export type EligibleDriver = {
  driverId: string;
  driverProfileId: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  rating: number;
  completedTrips: number;
  availability: string;
  baseRegion?: ServiceRegion | null;
  hasScheduleConflict: boolean;
  conflictRunReference?: string | null;
  vehicles: EligibleVehicle[];
};

export type AdminUserRecord = {
  id: string;
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: string;
  roles: Array<{ role: { code: string; name: string } }>;
  bookingCount: number;
  completedBookings: number;
  totalSpent: number;
  currency: string;
  latestBookingAt?: string | null;
};

export const REGION_KIND_LABELS: Record<RegionKind, string> = {
  COUNTRY_ACCESS: "صلاحية دخول دولة",
  OPERATING_HUB: "مركز تشغيل",
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  CITY: "مدينة",
  AIRPORT: "مطار",
  GOVERNORATE: "محافظة",
  BORDER: "معبر حدودي",
  STATION: "محطة",
};

export const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  INTERCITY: "بين المدن",
  INTERNATIONAL: "دولي",
  AIRPORT_TRANSFER: "نقل مطار",
  PRIVATE_TRANSFER: "نقل خاص",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  EXPIRED: "منتهية",
  SUSPENDED: "موقوفة",
};

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  PENDING: "بانتظار الاعتماد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  DELETED: "محذوف",
};

export const MEDIA_PURPOSE_LABELS: Record<MediaPurpose, string> = {
  DRIVER_AVATAR: "صورة سائق",
  VEHICLE_IMAGE: "صورة مركبة",
  DRIVER_DOCUMENT: "وثيقة سائق",
  VEHICLE_DOCUMENT: "وثيقة مركبة",
  FLIGHT_TICKET: "تذكرة طيران",
  OTHER: "ملف آخر",
};

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "DRIVING_LICENSE", label: "رخصة القيادة" },
  { value: "PASSPORT", label: "جواز السفر" },
  { value: "IDENTITY_CARD", label: "الهوية الشخصية" },
  { value: "REGION_ENTRY_PERMIT", label: "تصريح دخول الدولة" },
  { value: "PASSENGER_TRANSPORT_PERMIT", label: "تصريح نقل الركاب" },
  { value: "VEHICLE_REGISTRATION", label: "رخصة المركبة" },
  { value: "VEHICLE_INSURANCE", label: "تأمين المركبة" },
  { value: "TECHNICAL_INSPECTION", label: "الفحص الفني" },
  { value: "OWNERSHIP_PROOF", label: "إثبات الملكية أو الوكالة" },
];

export function documentTypeLabel(value: string) {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function statusClass(status: string) {
  if (["APPROVED", "ACTIVE", "ONLINE", "COMPLETED"].includes(status)) return "success";
  if (["REJECTED", "EXPIRED", "SUSPENDED", "DELETED"].includes(status)) return "danger";
  if (["PENDING", "PENDING_REVIEW", "OFFLINE"].includes(status)) return "warning";
  return "neutral";
}
