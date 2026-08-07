export type TrackingCoordinate = [number, number];

export type TripRoutePlan = {
  tripId: string;
  geometry: {
    type: "LineString";
    coordinates: TrackingCoordinate[];
  };
  waypoints: Array<{ latitude: number; longitude: number; label?: string }>;
  distanceKm: number | null;
  durationMinutes: number | null;
  version: number;
  lockedAt: string | null;
  updatedAt: string;
};

export type TripLiveLocation = {
  tripId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: string;
};

export type TrackingTrip = {
  id: string;
  status: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  travelDate: string | null;
  driver?: { firstName: string; lastName: string } | null;
};

export type TripTrackingPayload = {
  trip: TrackingTrip;
  routePlan: TripRoutePlan | null;
  liveLocation: TripLiveLocation | null;
};

export type TrackingShare = {
  id: string;
  token: string;
  expiresAt: string;
};
