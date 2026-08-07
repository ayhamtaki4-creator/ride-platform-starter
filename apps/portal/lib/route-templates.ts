import type { ServiceLocation, ServiceRoute } from "./admin-operations";
import type { TrackingCoordinate } from "./tracking";

export type SavedRouteTemplate = {
  routeId: string;
  originAddress: string;
  originLatitude: number;
  originLongitude: number;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  geometry: {
    type: "LineString";
    coordinates: TrackingCoordinate[];
  } | null;
  waypoints: Array<{ latitude: number; longitude: number; label?: string }>;
  distanceKm: number | null;
  durationMinutes: number | null;
  updatedAt: string;
};

export type AdminRouteTemplateRecord = {
  route: Pick<
    ServiceRoute,
    | "id"
    | "code"
    | "nameAr"
    | "nameEn"
    | "originId"
    | "destinationId"
    | "routeType"
    | "isActive"
    | "estimatedMinutes"
    | "distanceKm"
  > & {
    origin: ServiceLocation;
    destination: ServiceLocation;
  };
  template: SavedRouteTemplate | null;
};
