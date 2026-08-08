import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapsCacheService } from './maps-cache.service';

type ProviderName = 'mapbox' | 'public-osm';

export type MapPlace = {
  id?: string;
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  countryCode?: string;
};

export type DrivingRoute = {
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  distanceKm: number;
  durationMinutes: number;
};

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly timeoutMs: number;
  private warnedAboutPublicFallback = false;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: MapsCacheService
  ) {
    const configured = Number.parseInt(
      this.config.get<string>('MAP_UPSTREAM_TIMEOUT_MS') ?? '',
      10
    );
    this.timeoutMs = Number.isInteger(configured) && configured > 0 ? configured : 8000;
  }

  async search(query: string, limit = 6) {
    const provider = this.provider();
    const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();
    const items = await this.cache.remember(
      'search',
      `${provider}|${normalizedQuery}|${limit}`,
      this.positiveInt('MAPS_SEARCH_CACHE_TTL_SECONDS', 3600),
      () =>
        provider === 'mapbox'
          ? this.mapboxSearch(query, limit)
          : this.nominatimSearch(query, limit)
    );

    return { provider, items };
  }

  async reverse(latitude: number, longitude: number) {
    const provider = this.provider();
    const identity = `${provider}|${this.coordinateKey(latitude)}|${this.coordinateKey(longitude)}`;
    const item = await this.cache.remember(
      'reverse',
      identity,
      this.positiveInt('MAPS_REVERSE_CACHE_TTL_SECONDS', 21600),
      () =>
        provider === 'mapbox'
          ? this.mapboxReverse(latitude, longitude)
          : this.nominatimReverse(latitude, longitude)
    );

    return { provider, item };
  }

  async route(
    pickupLatitude: number,
    pickupLongitude: number,
    dropoffLatitude: number,
    dropoffLongitude: number
  ) {
    const provider = this.provider();
    const identity = [
      provider,
      this.coordinateKey(pickupLatitude),
      this.coordinateKey(pickupLongitude),
      this.coordinateKey(dropoffLatitude),
      this.coordinateKey(dropoffLongitude)
    ].join('|');
    const route = await this.cache.remember(
      'route',
      identity,
      this.positiveInt('MAPS_ROUTE_CACHE_TTL_SECONDS', 21600),
      () =>
        provider === 'mapbox'
          ? this.mapboxRoute(
              pickupLatitude,
              pickupLongitude,
              dropoffLatitude,
              dropoffLongitude
            )
          : this.osrmRoute(
              pickupLatitude,
              pickupLongitude,
              dropoffLatitude,
              dropoffLongitude
            )
    );

    return { provider, route };
  }

  private provider(): ProviderName {
    const configured = this.config
      .get<string>('MAP_PROVIDER')
      ?.trim()
      .toLowerCase();
    const mapboxToken = this.mapboxToken();

    if (configured === 'mapbox') {
      if (!mapboxToken) {
        throw new ServiceUnavailableException(
          'خدمة الخرائط المدارة غير مهيأة على الخادم.'
        );
      }
      return 'mapbox';
    }

    if (configured === 'public-osm') {
      this.warnPublicFallback();
      return 'public-osm';
    }

    if (mapboxToken) return 'mapbox';

    this.warnPublicFallback();
    return 'public-osm';
  }

  private warnPublicFallback() {
    if (this.warnedAboutPublicFallback) return;
    this.warnedAboutPublicFallback = true;
    this.logger.warn(
      'MAPBOX_ACCESS_TOKEN is not configured; using public Nominatim/OSRM fallback. Configure MAP_PROVIDER=mapbox for production.'
    );
  }

  private mapboxToken() {
    return this.config.get<string>('MAPBOX_ACCESS_TOKEN')?.trim() || '';
  }

  private mapboxGeocodingUrl(path: 'forward' | 'reverse') {
    const base = (
      this.config.get<string>('MAPBOX_GEOCODING_BASE_URL') ??
      'https://api.mapbox.com/search/geocode/v6'
    ).replace(/\/+$/, '');
    return new URL(`${base}/${path}`);
  }

  private mapboxDirectionsUrl(coordinates: string) {
    const base = (
      this.config.get<string>('MAPBOX_DIRECTIONS_BASE_URL') ??
      'https://api.mapbox.com/directions/v5/mapbox/driving'
    ).replace(/\/+$/, '');
    return new URL(`${base}/${coordinates}`);
  }

  private async mapboxSearch(query: string, limit: number): Promise<MapPlace[]> {
    const url = this.mapboxGeocodingUrl('forward');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('language', 'ar');
    url.searchParams.set('country', 'sy,lb,jo');
    url.searchParams.set('access_token', this.mapboxToken());

    const data = await this.fetchJson<{
      features?: Array<{
        id?: string;
        geometry?: { coordinates?: number[] };
        properties?: {
          name?: string;
          full_address?: string;
          place_formatted?: string;
          coordinates?: { longitude?: number; latitude?: number };
          context?: {
            place?: { name?: string };
            country?: { country_code?: string };
          };
        };
      }>;
    }>(url);

    const items: MapPlace[] = [];
    for (const feature of data.features ?? []) {
      const longitude = Number(
        feature.properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0]
      );
      const latitude = Number(
        feature.properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1]
      );
      const label =
        feature.properties?.full_address ||
        [feature.properties?.name, feature.properties?.place_formatted]
          .filter(Boolean)
          .join('، ');

      if (!label || !this.validCoordinates(latitude, longitude)) continue;

      items.push({
        id: feature.id,
        label,
        latitude,
        longitude,
        city: feature.properties?.context?.place?.name,
        countryCode: feature.properties?.context?.country?.country_code?.toUpperCase()
      });
    }
    return items;
  }

  private async mapboxReverse(
    latitude: number,
    longitude: number
  ): Promise<MapPlace | null> {
    const url = this.mapboxGeocodingUrl('reverse');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('language', 'ar');
    url.searchParams.set('access_token', this.mapboxToken());

    const data = await this.fetchJson<{
      features?: Array<{
        id?: string;
        properties?: {
          name?: string;
          full_address?: string;
          place_formatted?: string;
          coordinates?: { longitude?: number; latitude?: number };
          context?: {
            place?: { name?: string };
            country?: { country_code?: string };
          };
        };
      }>;
    }>(url);
    const feature = data.features?.[0];
    if (!feature) return null;

    const resultLongitude = Number(
      feature.properties?.coordinates?.longitude ?? longitude
    );
    const resultLatitude = Number(
      feature.properties?.coordinates?.latitude ?? latitude
    );
    const label =
      feature.properties?.full_address ||
      [feature.properties?.name, feature.properties?.place_formatted]
        .filter(Boolean)
        .join('، ');

    if (!label || !this.validCoordinates(resultLatitude, resultLongitude)) {
      return null;
    }

    return {
      id: feature.id,
      label,
      latitude: resultLatitude,
      longitude: resultLongitude,
      city: feature.properties?.context?.place?.name,
      countryCode: feature.properties?.context?.country?.country_code?.toUpperCase()
    };
  }

  private async mapboxRoute(
    pickupLatitude: number,
    pickupLongitude: number,
    dropoffLatitude: number,
    dropoffLongitude: number
  ): Promise<DrivingRoute | null> {
    const coordinates = `${pickupLongitude},${pickupLatitude};${dropoffLongitude},${dropoffLatitude}`;
    const url = this.mapboxDirectionsUrl(coordinates);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'false');
    url.searchParams.set('access_token', this.mapboxToken());

    const data = await this.fetchJson<{
      routes?: Array<{
        geometry?: { type?: string; coordinates?: number[][] };
        distance?: number;
        duration?: number;
      }>;
    }>(url);
    return this.normalizeRoute(data.routes?.[0]);
  }

  private async nominatimSearch(query: string, limit: number): Promise<MapPlace[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ar');
    url.searchParams.set('countrycodes', 'sy,lb,jo');

    const data = await this.fetchJson<Array<{
      place_id?: number;
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: { city?: string; town?: string; village?: string; country_code?: string };
    }>>(url, this.publicHeaders());

    const items: MapPlace[] = [];
    for (const item of data) {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (!item.display_name || !this.validCoordinates(latitude, longitude)) continue;
      items.push({
        id: item.place_id ? String(item.place_id) : undefined,
        label: item.display_name,
        latitude,
        longitude,
        city: item.address?.city ?? item.address?.town ?? item.address?.village,
        countryCode: item.address?.country_code?.toUpperCase()
      });
    }
    return items;
  }

  private async nominatimReverse(
    latitude: number,
    longitude: number
  ): Promise<MapPlace | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ar');

    const data = await this.fetchJson<{
      place_id?: number;
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: { city?: string; town?: string; village?: string; country_code?: string };
    }>(url, this.publicHeaders());

    if (!data.display_name) return null;
    const resultLatitude = Number(data.lat ?? latitude);
    const resultLongitude = Number(data.lon ?? longitude);
    if (!this.validCoordinates(resultLatitude, resultLongitude)) return null;

    return {
      id: data.place_id ? String(data.place_id) : undefined,
      label: data.display_name,
      latitude: resultLatitude,
      longitude: resultLongitude,
      city: data.address?.city ?? data.address?.town ?? data.address?.village,
      countryCode: data.address?.country_code?.toUpperCase()
    };
  }

  private async osrmRoute(
    pickupLatitude: number,
    pickupLongitude: number,
    dropoffLatitude: number,
    dropoffLongitude: number
  ): Promise<DrivingRoute | null> {
    const coordinates = `${pickupLongitude},${pickupLatitude};${dropoffLongitude},${dropoffLatitude}`;
    const url = new URL(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}`
    );
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'false');

    const data = await this.fetchJson<{
      routes?: Array<{
        geometry?: { type?: string; coordinates?: number[][] };
        distance?: number;
        duration?: number;
      }>;
    }>(url, this.publicHeaders());
    return this.normalizeRoute(data.routes?.[0]);
  }

  private normalizeRoute(route?: {
    geometry?: { type?: string; coordinates?: number[][] };
    distance?: number;
    duration?: number;
  }): DrivingRoute | null {
    if (
      !route ||
      route.geometry?.type !== 'LineString' ||
      !Array.isArray(route.geometry.coordinates) ||
      route.geometry.coordinates.length < 2
    ) {
      return null;
    }

    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
      return null;
    }

    return {
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates
      },
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationMinutes: Math.max(1, Math.round(durationSeconds / 60))
    };
  }

  private publicHeaders() {
    const portalUrl = this.config.get<string>('PORTAL_URL')?.trim();
    return {
      'Accept-Language': 'ar',
      'User-Agent': `RidePlatform/1.0${portalUrl ? ` (${portalUrl})` : ''}`
    };
  }

  private coordinateKey(value: number) {
    return value.toFixed(6);
  }

  private positiveInt(name: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(name) ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private validCoordinates(latitude: number, longitude: number) {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    );
  }

  private async fetchJson<T>(url: URL, headers?: Record<string, string>): Promise<T> {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) {
        throw new Error(`upstream status ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(
        `Maps upstream request failed (${url.hostname}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new ServiceUnavailableException(
        'خدمة الخرائط غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.'
      );
    }
  }
}
