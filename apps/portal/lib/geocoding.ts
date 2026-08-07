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

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodingResult> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("إحداثيات خط العرض غير صالحة.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("إحداثيات خط الطول غير صالحة.");
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "ar,en",
  });
  const response = await fetch(`${GEOCODING_URL}/reverse?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("تعذر قراءة عنوان الموقع المحدد حاليًا.");

  const body = (await response.json()) as {
    lat?: string;
    lon?: string;
    display_name?: string;
  };
  const resolvedLatitude = Number(body.lat ?? latitude);
  const resolvedLongitude = Number(body.lon ?? longitude);

  return {
    latitude: Number.isFinite(resolvedLatitude) ? resolvedLatitude : latitude,
    longitude: Number.isFinite(resolvedLongitude) ? resolvedLongitude : longitude,
    label:
      body.display_name?.trim() ||
      `موقع محدد على الخريطة (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
  };
}
