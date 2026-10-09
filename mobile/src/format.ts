export type LngLat = [number, number];

export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// "Tue 7:42 AM"
export function dayAndTime(ms: number): string {
  const date = new Date(ms);
  const day = date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// "7:42" and "Tue AM", for the camera's shutter bar
export function clockParts(ms: number): { time: string; caption: string } {
  const date = new Date(ms);
  // ICU puts a narrow no-break space (U+202F) before AM/PM, not a plain space
  const [time, meridiem] = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).split(/\s/u);
  return { time, caption: `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${meridiem ?? ''}`.trim() };
}

// "44.431° N, 104.382° W"
export function formatCoords(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(3)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(3)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}

const EARTH_METERS = 6_371_000;
const FEET_PER_METER = 3.28084;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceMeters([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.sqrt(a));
}

// Degrees clockwise from true north, 0–360
export function bearingDegrees([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function compassPoint(degrees: number): string {
  return COMPASS[Math.round(degrees / 45) % 8];
}

// Feet up close, miles past ~500 ft: how a hand on horseback thinks about it
export function formatDistance(meters: number): string {
  const feet = meters * FEET_PER_METER;
  if (feet < 528) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  const miles = feet / 5280;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

// "0.4 mi NE of you", or "300 ft N of you" up close
export function relativeTo(from: LngLat, to: LngLat): string {
  const meters = distanceMeters(from, to);
  if (meters < 30) return 'Right where you are';
  return `${formatDistance(meters)} ${compassPoint(bearingDegrees(from, to))} of you`;
}

// "1 h 20 m", "12 m", "40 s"
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (minutes < 60) return `${minutes} m`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

// "1:05:09", for a running timer
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
