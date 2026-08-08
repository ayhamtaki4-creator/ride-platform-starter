# Production maps configuration

The portal uses first-party API routes under `/api/maps/*`. Provider credentials stay on the API server and must never be exposed through `NEXT_PUBLIC_*` variables.

## Recommended production configuration

```env
MAP_PROVIDER=mapbox
MAPBOX_ACCESS_TOKEN=<server-side token>
MAP_UPSTREAM_TIMEOUT_MS=8000
MAPS_RATE_LIMIT_ENABLED=true
MAPS_IP_MAX=120
MAPS_WINDOW_SECONDS=60
MAPS_CACHE_ENABLED=true
MAPS_SEARCH_CACHE_TTL_SECONDS=3600
MAPS_REVERSE_CACHE_TTL_SECONDS=21600
MAPS_ROUTE_CACHE_TTL_SECONDS=21600
```

The maps cache uses the existing `REDIS_URL`. Cache failures are non-blocking: when Redis is temporarily unavailable, the API calls the configured maps provider directly instead of failing a valid booking or map interaction.

Search results are cached for one hour by default. Reverse-geocoding and driving-route results are cached for six hours. Coordinates are normalized to six decimal places for cache identity, which is approximately sub-meter precision for this use case.

Do not configure `MAPBOX_GEOCODING_BASE_URL` or `MAPBOX_DIRECTIONS_BASE_URL` in production. Those overrides exist for deterministic tests/private compatible gateways; production defaults point to Mapbox official APIs.

If `MAP_PROVIDER` is omitted and no Mapbox token exists, the API keeps compatibility by using public Nominatim for geocoding and public OSRM for driving routes. This fallback is intended as a transition/development path rather than the preferred production configuration.
