import type { LngLatBounds } from '@maplibre/maplibre-react-native';

export const PACK_MIN_ZOOM = 10;
// USGS imagery stops at 16; the map overzooms past that
export const PACK_MAX_ZOOM = 16;
// MapLibre's default per-pack ceiling
export const TILE_LIMIT = 6000;

function tileX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function tileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

export function estimateTiles([west, south, east, north]: LngLatBounds, minZoom = PACK_MIN_ZOOM, maxZoom = PACK_MAX_ZOOM): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    total += (tileX(east, z) - tileX(west, z) + 1) * (tileY(south, z) - tileY(north, z) + 1);
  }
  return total;
}
