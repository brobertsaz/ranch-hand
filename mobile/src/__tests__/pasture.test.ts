import type { LngLat } from '../format';
import { contains, nextPastureName, outlineFromTrack, pastureAt } from '../pasture';

// A section near Gillette: one mile on a side is 640 acres
const LAT = 44.3;
const MILE_LAT = 1609.344 / 111_320;
const MILE_LNG = MILE_LAT / Math.cos((LAT * Math.PI) / 180);
const W = -105.5;

// Riding the fence of a square, a point every ~10 m, with a meter or two of GPS wobble
function rideSquare(miles = 1, closeGap = 0): LngLat[] {
  const corners: LngLat[] = [
    [W, LAT], [W + MILE_LNG * miles, LAT], [W + MILE_LNG * miles, LAT + MILE_LAT * miles], [W, LAT + MILE_LAT * miles], [W, LAT + closeGap],
  ];
  const track: LngLat[] = [];
  for (let c = 0; c < corners.length - 1; c++) {
    const [a, b] = [corners[c], corners[c + 1]];
    for (let i = 0; i < 160; i++) {
      const t = i / 160;
      const wobble = (i % 2 ? 1 : -1) * 0.000015;
      track.push([a[0] + (b[0] - a[0]) * t + wobble, a[1] + (b[1] - a[1]) * t - wobble]);
    }
  }
  return track;
}

it('turns a ride around a section into a 640-acre outline with a handful of corners', () => {
  const outline = outlineFromTrack(rideSquare())!;

  expect(outline.acres).toBeGreaterThan(630);
  expect(outline.acres).toBeLessThan(650);
  expect(outline.ring.length).toBeLessThan(40);
  expect(outline.ring[0]).toEqual(outline.ring[outline.ring.length - 1]);
});

it('says how far the ride ended from where it started', () => {
  const outline = outlineFromTrack(rideSquare(1, MILE_LAT / 8))!;

  expect(outline.gapMeters).toBeGreaterThan(190);
  expect(outline.gapMeters).toBeLessThan(215);
});

it('has no outline for a ride straight out and back', () => {
  const out: LngLat[] = Array.from({ length: 50 }, (_, i) => [W + i * 0.0001, LAT]);

  expect(outlineFromTrack([...out, ...[...out].reverse()])).toBeNull();
});

it('finds the pasture a spot is in, and the trap inside it before the pasture around it', () => {
  const section = { name: 'Big', outline: JSON.stringify(outlineFromTrack(rideSquare())!.ring) };
  const trap = { name: 'Trap', outline: JSON.stringify(outlineFromTrack(rideSquare(0.25))!.ring) };
  const inBoth: LngLat = [W + MILE_LNG * 0.1, LAT + MILE_LAT * 0.1];
  const inSectionOnly: LngLat = [W + MILE_LNG * 0.7, LAT + MILE_LAT * 0.7];

  expect(pastureAt([section, trap], inBoth)?.name).toBe('Trap');
  expect(pastureAt([section, trap], inSectionOnly)?.name).toBe('Big');
  expect(pastureAt([section, trap], [W - 0.01, LAT])).toBeNull();
  expect(contains(JSON.parse(section.outline) as LngLat[], inSectionOnly)).toBe(true);
});

it('numbers new pastures after the highest one', () => {
  expect(nextPastureName([])).toBe('Pasture 1');
  expect(nextPastureName([{ name: 'Pasture 2' }, { name: 'North Section' }, { name: 'Pasture 7' }])).toBe('Pasture 8');
});
