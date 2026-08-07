import type { TrackingCoordinate } from "./tracking";

const ROUTING_URL = (process.env.NEXT_PUBLIC_ROUTING_URL ?? "https://router.project-osrm.org").replace(/\/$/, "");

export async function buildRoadRoute(points: Array<{ latitude: number; longitude: number }>) {
  if (points.length < 2) throw new Error("يلزم تحديد نقطتين على الأقل لحساب الطريق.");

  const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const response = await fetch(
    `${ROUTING_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("تعذر حساب الطريق الفعلي حاليًا.");

  const body = (await response.json()) as {
    code?: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { type: "LineString"; coordinates: TrackingCoordinate[] };
    }>;
  };
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route?.geometry?.coordinates?.length) {
    throw new Error("لم يتم العثور على طريق مناسب بين النقاط المحددة.");
  }

  return {
    geometry: route.geometry,
    distanceKm: route.distance / 1000,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
  };
}
