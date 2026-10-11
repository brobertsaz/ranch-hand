import type { LngLatBounds } from '@maplibre/maplibre-react-native';

export const PACK_MIN_ZOOM = 10;
// USGS imagery and topo stop at 16. Sharp areas go to 18, and only inside their bounds.
const USGS_MAX_ZOOM = 16;
export const PACK_MAX_ZOOM = 18;
// MapLibre defaults to 6,000 tiles a pack. The API caps a sharp area at 50,000, so the biggest one fits in one download.
export const TILE_LIMIT = 60_000;
// "Download this area" keeps the old 6,000 for the USGS part, so a zoomed-out view can't grab a whole county
export const VIEW_USGS_LIMIT = 6000;
// The style has two USGS tile sources (aerial and topo) and a pack downloads both
const USGS_SOURCES = 2;

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

function countTiles([west, south, east, north]: LngLatBounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    total += (tileX(east, z) - tileX(west, z) + 1) * (tileY(south, z) - tileY(north, z) + 1);
  }
  return total;
}

function overlap(a: LngLatBounds, b: LngLatBounds): LngLatBounds | null {
  const box: LngLatBounds = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return box[0] < box[2] && box[1] < box[3] ? box : null;
}

// USGS tiles over the whole box, and zoom 17-18 tiles wherever it overlaps a sharp area
export function estimateTiles(bounds: LngLatBounds, sharpAreas: LngLatBounds[] = []): { usgs: number; sharp: number; total: number } {
  const usgs = countTiles(bounds, PACK_MIN_ZOOM, USGS_MAX_ZOOM) * USGS_SOURCES;
  const sharp = sharpAreas.reduce((sum, area) => {
    const box = overlap(bounds, area);
    return box ? sum + countTiles(box, USGS_MAX_ZOOM + 1, PACK_MAX_ZOOM) : sum;
  }, 0);
  return { usgs, sharp, total: usgs + sharp };
}
