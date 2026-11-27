import type { Pasture } from './db';
import { distanceMeters, type LngLat } from './format';

const METERS_PER_DEGREE = 111_320;
const SQUARE_METERS_PER_ACRE = 4046.8564224;
// GPS wanders a few meters either side of a fence; points closer than this to the line add nothing
const SIMPLIFY_METERS = 4;
// The server's cap is 2,000; a mile of crooked fence thinned at 4 m comes nowhere near it
const MAX_POINTS = 1_500;

export type Outline = {
  // Closed: the last point repeats the first
  ring: LngLat[];
  acres: number;
  // How far the ride ended from where it started. Past a few hundred feet the closing side is a guess.
  gapMeters: number;
};

// A ride along a fence becomes the pasture's outline: thinned, then closed with a straight line back to the start
export function outlineFromTrack(track: LngLat[]): Outline | null {
  const points = dedupe(track);
  if (points.length < 3) return null;
  let thinned = simplify(points, SIMPLIFY_METERS);
  // A very long ride: thin harder until it fits
  for (let tolerance = SIMPLIFY_METERS * 2; thinned.length > MAX_POINTS; tolerance *= 2) thinned = simplify(points, tolerance);
  if (thinned.length < 3) return null;
  const first = thinned[0];
  const last = thinned[thinned.length - 1];
  const ring = [...thinned, first];
  const acres = areaSquareMeters(ring) / SQUARE_METERS_PER_ACRE;
  // A ride straight out and back has no inside to it
  if (acres < 0.5) return null;
  return { ring, acres, gapMeters: distanceMeters(last, first) };
}

export function parseOutline(pasture: Pick<Pasture, 'outline'>): LngLat[] {
  try {
    const ring = JSON.parse(pasture.outline) as unknown;
    return Array.isArray(ring) ? (ring as LngLat[]) : [];
  } catch {
    return [];
  }
}

export function boundsOf(ring: LngLat[]): [number, number, number, number] {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

export function acresOf(ring: LngLat[]): number {
  return areaSquareMeters(ring) / SQUARE_METERS_PER_ACRE;
}

// Ray casting. Fine for fences: no pasture is big enough for the earth's curve to matter.
export function contains(ring: LngLat[], [x, y]: LngLat): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The pasture this spot is in. A trap inside a bigger pasture wins: it's the smaller one.
export function pastureAt<T extends Pick<Pasture, 'outline'>>(pastures: T[], here: LngLat): T | null {
  let best: { pasture: T; acres: number } | null = null;
  for (const pasture of pastures) {
    const ring = parseOutline(pasture);
    if (ring.length < 4 || !contains(ring, here)) continue;
    const acres = acresOf(ring);
    if (!best || acres < best.acres) best = { pasture, acres };
  }
  return best?.pasture ?? null;
}

// Where the name goes: the middle of the pasture by area, which for an L-shaped one can land outside the
// fence. shortcut: an L or U pasture can have its label sit outside it; use a pole-of-inaccessibility search if that confuses anyone.
export function labelPoint(ring: LngLat[]): LngLat {
  const origin = ring[0];
  const meters = ring.map((p) => toMeters(p, origin));
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < meters.length - 1; i++) {
    const [x0, y0] = meters[i];
    const [x1, y1] = meters[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    const [w, s, e, n] = boundsOf(ring);
    return [(w + e) / 2, (s + n) / 2];
  }
  return fromMeters([cx / (3 * area), cy / (3 * area)], origin);
}

export function nextPastureName(pastures: Pick<Pasture, 'name'>[]): string {
  const numbers = pastures.map((p) => Number(/^Pasture (\d+)$/.exec(p.name)?.[1] ?? 0));
  return `Pasture ${Math.max(0, ...numbers) + 1}`;
}

export function formatAcres(acres: number): string {
  return acres >= 100 ? `${Math.round(acres).toLocaleString('en-US')} acres` : `${acres.toFixed(acres >= 10 ? 0 : 1)} acres`;
}

function dedupe(track: LngLat[]): LngLat[] {
  return track.filter((p, i) => i === 0 || p[0] !== track[i - 1][0] || p[1] !== track[i - 1][1]);
}

// Flat meters around a point: plenty accurate across one ranch
function toMeters([lng, lat]: LngLat, [lng0, lat0]: LngLat): [number, number] {
  return [(lng - lng0) * METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * METERS_PER_DEGREE];
}

function fromMeters([x, y]: [number, number], [lng0, lat0]: LngLat): LngLat {
  return [lng0 + x / (METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180)), lat0 + y / METERS_PER_DEGREE];
}

function areaSquareMeters(ring: LngLat[]): number {
  const meters = ring.map((p) => toMeters(p, ring[0]));
  let sum = 0;
  for (let i = 0; i < meters.length - 1; i++) sum += meters[i][0] * meters[i + 1][1] - meters[i + 1][0] * meters[i][1];
  return Math.abs(sum) / 2;
}

// Douglas-Peucker, iterative so a three-day ride can't overflow the stack
function simplify(points: LngLat[], tolerance: number): LngLat[] {
  const origin = points[0];
  const meters = points.map((p) => toMeters(p, origin));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = offLine(meters[i], meters[start], meters[end]);
      if (d > farthestDistance) {
        farthest = i;
        farthestDistance = d;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function offLine([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
}
