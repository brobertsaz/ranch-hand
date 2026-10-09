import type { Waypoint } from './db';
import { distanceMeters, type LngLat } from './format';

// Following a ride someone else saved: where you are against their track, and what it passes

// Within this you're on the trail; GPS on horseback wanders about this much
export const ON_TRAIL_METERS = 30;
// A place this close to the track is one the ride went by
export const ALONG_TRAIL_METERS = 50;

export type TrailPosition = {
  // How far you are from the nearest point on the track
  offMeters: number;
  // That nearest point, to point the arrow back at
  nearest: LngLat;
  // How far along the track that point is, from its start
  alongMeters: number;
};

export type PlaceOnTrail = { waypoint: Waypoint; alongMeters: number };

// Running distance from the start to each point
export function cumulative(track: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < track.length; i++) out.push(out[i - 1] + distanceMeters(track[i - 1], track[i]));
  return out;
}

// Nearest point on the track, segment by segment. Over a few miles the ground is flat enough
// to project in local meters (equirectangular), then measure the result properly.
export function locateOnTrack(track: LngLat[], along: number[], here: LngLat): TrailPosition | null {
  if (track.length === 0) return null;
  if (track.length === 1) return { offMeters: distanceMeters(here, track[0]), nearest: track[0], alongMeters: 0 };

  const metersPerLng = 111_320 * Math.cos((here[1] * Math.PI) / 180);
  const metersPerLat = 110_540;
  const toXY = ([lng, lat]: LngLat) => [(lng - here[0]) * metersPerLng, (lat - here[1]) * metersPerLat];

  let best: TrailPosition | null = null;
  let bestSq = Infinity;
  for (let i = 1; i < track.length; i++) {
    const [ax, ay] = toXY(track[i - 1]);
    const [bx, by] = toXY(track[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    // here is the origin, so project (0,0) onto the segment
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const sq = px * px + py * py;
    if (sq < bestSq) {
      bestSq = sq;
      const [lng1, lat1] = track[i - 1];
      const [lng2, lat2] = track[i];
      const nearest: LngLat = [lng1 + t * (lng2 - lng1), lat1 + t * (lat2 - lat1)];
      best = { offMeters: Math.sqrt(sq), nearest, alongMeters: along[i - 1] + t * (along[i] - along[i - 1]) };
    }
  }
  return best;
}

// The crew's places this ride went past, in the order you reach them
export function placesOnTrail(track: LngLat[], along: number[], waypoints: Waypoint[]): PlaceOnTrail[] {
  return waypoints
    .map((waypoint) => ({ waypoint, at: locateOnTrack(track, along, [waypoint.longitude, waypoint.latitude]) }))
    .filter((p) => p.at && p.at.offMeters <= ALONG_TRAIL_METERS)
    .map((p) => ({ waypoint: p.waypoint, alongMeters: p.at!.alongMeters }))
    .sort((a, b) => a.alongMeters - b.alongMeters);
}
