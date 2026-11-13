import type { LngLat } from './format';

// The GeoJSON shapes the map draws tracks and outlines from

export function lineString(coordinates: LngLat[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
}

export function endPoint(coordinates: LngLat, end: 'start' | 'end'): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', properties: { end }, geometry: { type: 'Point', coordinates } };
}
