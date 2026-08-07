const GEOCODING_URL = (process.env.NEXT_PUBLIC_GEOCODING_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");

export type GeocodingResult = {
  latitude: number;
  longitude: number;
  label: string;
};

export async function searchPlace(query: string): Promise<GeocodingResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) throw new Error("اكتب اسم مكان أو عنوان للبحث.");

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    q: trimmed,
    "accept-language": "ar,en",
  });
  const response = await fetch(`${GEOCODING_URL}/search?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("تعذر البحث عن الموقع حاليًا.");

  const body = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;
  const first = body[0];
  const latitude = Number(first?.lat);
  const longitude = Number(first?.lon);
  if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("لم يتم العثور على موقع مطابق.");
  }

  return {
    latitude,
    longitude,
    label: first.display_name?.trim() || trimmed,
  };
}
