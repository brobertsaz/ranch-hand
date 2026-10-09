import type { LngLatBounds } from '@maplibre/maplibre-react-native';

export const PACK_MIN_ZOOM = 10;
// USGS imagery stops at 16; the map overzooms past that
export const PACK_MAX_ZOOM = 16;
// MapLibre's default per-pack ceiling
export const TILE_LIMIT = 6000;
// The style has two tile sources (aerial and topo) and a pack downloads both
const PACK_SOURCES = 2;

// Zoomed in, the screen covers a few hundred metres, so a download always grabs at least this much
export const MIN_PACK_SPAN_KM = 5;

export function expandBounds([west, south, east, north]: LngLatBounds, minSpanKm = MIN_PACK_SPAN_KM): LngLatBounds {
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const halfLat = Math.max((north - south) / 2, minSpanKm / 2 / 111.32);
  const halfLng = Math.max((east - west) / 2, minSpanKm / 2 / (111.32 * Math.cos((centerLat * Math.PI) / 180)));
  return [centerLng - halfLng, centerLat - halfLat, centerLng + halfLng, centerLat + halfLat];
}

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
  return total * PACK_SOURCES;
}
