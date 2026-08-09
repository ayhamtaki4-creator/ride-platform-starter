const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
const configuredTileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim();
const configuredAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim();

const OPENSTREETMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OPENSTREETMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_TILE_URL = mapboxToken
  ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(mapboxToken)}`
  : configuredTileUrl || OPENSTREETMAP_TILE_URL;

export const MAP_TILE_ATTRIBUTION = mapboxToken
  ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : configuredAttribution || OPENSTREETMAP_ATTRIBUTION;

export const USING_PUBLIC_OSM_TILES =
  !mapboxToken && !configuredTileUrl;
