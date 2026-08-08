import { apiFetch } from "@/lib/api";

export type GeocodingResult = {
  id?: string;
  latitude: number;
  longitude: number;
  label: string;
  city?: string;
  countryCode?: string;
};

export type DrivingRoute = {
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  distanceKm: number;
  durationMinutes: number;
};

type SearchResponse = {
  provider: "mapbox" | "public-osm";
  items: GeocodingResult[];
};

type ReverseResponse = {
  provider: "mapbox" | "public-osm";
  item: GeocodingResult | null;
};

type RouteResponse = {
  provider: "mapbox" | "public-osm";
  route: DrivingRoute | null;
};

export async function searchPlace(query: string): Promise<GeocodingResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) throw new Error("اكتب اسم مكان أو عنوان للبحث.");

  const response = await apiFetch<SearchResponse>(
    `/maps/geocode/search?query=${encodeURIComponent(trimmed)}&limit=6`,
    { skipAuth: true },
  );
  const first = response.items[0];
  if (!first) throw new Error("لم يتم العثور على موقع مطابق.");
  return first;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodingResult> {
  assertCoordinates(latitude, longitude);

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });
  const response = await apiFetch<ReverseResponse>(
    `/maps/geocode/reverse?${params.toString()}`,
    { skipAuth: true },
  );

  return response.item ?? {
    latitude,
    longitude,
    label: `موقع محدد على الخريطة (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
  };
}

export async function getDrivingRoute(
  pickupLatitude: number,
  pickupLongitude: number,
  dropoffLatitude: number,
  dropoffLongitude: number,
): Promise<DrivingRoute | null> {
  assertCoordinates(pickupLatitude, pickupLongitude);
  assertCoordinates(dropoffLatitude, dropoffLongitude);

  const params = new URLSearchParams({
    pickupLatitude: String(pickupLatitude),
    pickupLongitude: String(pickupLongitude),
    dropoffLatitude: String(dropoffLatitude),
    dropoffLongitude: String(dropoffLongitude),
  });
  const response = await apiFetch<RouteResponse>(
    `/maps/route?${params.toString()}`,
    { skipAuth: true },
  );
  return response.route;
}

function assertCoordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("إحداثيات خط العرض غير صالحة.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("إحداثيات خط الطول غير صالحة.");
  }
}
