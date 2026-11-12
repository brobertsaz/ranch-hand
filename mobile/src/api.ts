import type { Device } from './settings';
import type { Changes } from './sync';

// code is the server's own word for what went wrong, when it sends one: { "error": "removed" }
export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string | null = null) {
    super(message);
  }
}

// Android's fetch never gives up by itself, so a request that stalls at the edge of signal would hang for good
export const REQUEST_TIMEOUT_MS = 20_000;
// A first pull is the ranch's whole history
export const SYNC_TIMEOUT_MS = 60_000;
// A photo over one bar of signal
export const PHOTO_TIMEOUT_MS = 120_000;

export class TimeoutError extends Error {
  constructor() {
    super('The server took too long to answer.');
  }
}

// An abort signal that fires after `ms`, or as soon as `outer` does (a sync being cancelled). Call clear() when done.
export function deadline(ms: number, outer?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, ms);
  if (outer?.aborted) abort();
  else outer?.addEventListener('abort', abort);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', abort);
    },
  };
}

type RequestOptions = RequestInit & { timeoutMs?: number };

async function request<T>(device: Pick<Device, 'apiUrl'> & Partial<Device>, path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal, ...init } = options;
  const limit = deadline(timeoutMs, signal ?? undefined);
  try {
    const response = await fetch(`${device.apiUrl}${path}`, {
      ...init,
      signal: limit.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(device.token ? { Authorization: `Bearer ${device.token}` } : {}),
        ...init.headers,
      },
    });
    // Some answers have no body (204, or an older server's push), so read text and parse only what's there
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, `${init.method ?? 'GET'} ${path} failed: ${response.status}`, errorCode(text));
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    throw limit.timedOut() ? new TimeoutError() : error;
  } finally {
    limit.clear();
  }
}

export function errorCode(body: string): string | null {
  try {
    const code = (JSON.parse(body) as { error?: unknown } | null)?.error;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

// 401 on a signed-in request: the owner removed this phone ("removed"), or the server no longer knows its token
export function isSignedOut(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

// An error in words a hand can act on, for alerts and the sync status
export function errorText(error: unknown): string {
  if (error instanceof TimeoutError) return error.message;
  // 422 comes with the server's own sentence: "This ranch already has 20 sharp areas."
  if (error instanceof ApiError && error.status === 422 && error.code) return error.code;
  if (error instanceof ApiError) return `The server had a problem (${error.status}).`;
  // fetch's own failure means it never reached the server: a TypeError from React Native's fetch, or Expo's
  // FetchError ("fetch failed: UnexpectedException: Could not connect to the server…"), which isn't exported
  if (error instanceof TypeError || (error instanceof Error && error.message.startsWith('fetch failed'))) return "Couldn't reach the server.";
  return (error as Error)?.message ?? 'Something went wrong.';
}

export type Headquarters = { lat: number; lng: number };

export type Joined = { token: string; member_id: string; ranch: { id: string; name: string; headquarters: Headquarters | null } };

// 403 means the ranch already has as many hands as its plan allows; 429 means too many tries in a row
export function joinRanch(apiUrl: string, inviteCode: string, name: string) {
  return request<Joined>({ apiUrl }, '/api/v1/devices', {
    method: 'POST',
    body: JSON.stringify({ invite_code: inviteCode, name }),
  });
}

// An owner signs in with the ID token Google Sign-In gave the phone. The first time starts the ranch
// (ranchName is ignored after that); a returning owner gets their same ranch back.
export function startRanch(apiUrl: string, idToken: string, ranchName: string) {
  return request<Joined>({ apiUrl }, '/api/v1/owners', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken, ranch_name: ranchName }),
  });
}

export function pullChanges(device: Device, lastPulledAt: number | null, signal?: AbortSignal) {
  const query = lastPulledAt ? `?last_pulled_at=${lastPulledAt}` : '';
  return request<{ changes: Changes; timestamp: number }>(device, `/api/v1/sync${query}`, { signal, timeoutMs: SYNC_TIMEOUT_MS });
}

// id is null when the server couldn't read the one it was sent
export type Rejected = { table: 'waypoints' | 'observations' | 'photos' | 'rides'; id: string | null; reason: string };

// The server applies each record separately and names the ones it turned down. An older server sends no body.
export function pushChanges(device: Device, changes: Changes, signal?: AbortSignal) {
  return request<{ rejected?: Rejected[] } | undefined>(device, '/api/v1/sync', {
    method: 'POST',
    body: JSON.stringify({ changes }),
    signal,
    timeoutMs: SYNC_TIMEOUT_MS,
  });
}

// The hand on this phone leaves the crew, which frees their spot. Owners get 422: a ranch keeps its owner.
// Short timeout: leaving shouldn't hang on a weak signal.
export function leaveCrew(device: Device) {
  return request<void>(device, '/api/v1/device', { method: 'DELETE', timeoutMs: 8000 });
}

// Deletes the person on this phone. A hand's name is erased and their token stops working; what they logged
// stays with the ranch. An owner's whole ranch goes, for everyone. There is no undo on the server.
export function deleteAccount(device: Device) {
  return request<void>(device, '/api/v1/account', { method: 'DELETE' });
}

// Owner only: take a hand off the crew. Their phone gets a 401 "removed" from then on.
export function removeMember(device: Device, memberId: string) {
  return request<void>(device, `/api/v1/members/${memberId}`, { method: 'DELETE' });
}

// Owner only: a fresh invite code. The old one stops working.
export function newInviteCode(device: Device) {
  return request<{ invite_code: string }>(device, '/api/v1/ranch/invite_code', { method: 'POST' });
}

// plan and unlimited_hands are missing from an older server, which only had the free plan
export type Ranch = {
  id: string;
  name: string;
  invite_code: string;
  hand_count: number;
  hand_limit: number;
  headquarters: Headquarters | null;
  plan?: 'free' | 'pro' | 'founding';
  unlimited_hands?: boolean;
};

export function fetchRanch(device: Device) {
  return request<Ranch>(device, '/api/v1/ranch');
}

// Owner only. The server also sharpens a square that many miles across around it, unless a sharp area already covers it.
export function setHeadquarters(device: Device, { lat, lng }: Headquarters, miles: number) {
  return request<{ headquarters: Headquarters; map_area_id: string | null }>(device, '/api/v1/ranch', {
    method: 'PATCH',
    body: JSON.stringify({ headquarters: { lat, lng, miles } }),
  });
}

// A named spot, like a pasture a couple of miles from headquarters, sharpened in a square that many miles across
export function sharpenAround(device: Device, { lat, lng }: Headquarters, miles: number, name: string) {
  return request<MapArea>(device, '/api/v1/map_areas', { method: 'POST', body: JSON.stringify({ map_area: { name, lat, lng, miles } }) });
}

export function estimateAround(device: Device, { lat, lng }: Headquarters, miles: number) {
  return request<SharpenEstimate>(device, `/api/v1/map_areas/new?lat=${lat}&lng=${lng}&miles=${miles}`);
}

export type MapArea = {
  id: string;
  name: string;
  west: number;
  south: number;
  east: number;
  north: number;
  status: 'pending' | 'rendering' | 'ready' | 'failed';
  tile_count: number;
  estimated_tiles: number;
  rendered_at: string | null;
  // Where its close-up tiles come from (a state's own imagery, or NAIP) and how far they zoom
  source: string;
  source_name: string;
  max_zoom: number;
};

export type SharpenEstimate = { source_name: string; max_zoom: number; estimated_tiles: number; estimated_megabytes: number; estimated_minutes: number };

export function estimateSharpening(device: Device, [west, south, east, north]: [number, number, number, number]) {
  return request<SharpenEstimate>(device, `/api/v1/map_areas/new?west=${west}&south=${south}&east=${east}&north=${north}`);
}

export function fetchMapAreas(device: Device) {
  return request<MapArea[]>(device, '/api/v1/map_areas');
}

export function sharpenArea(device: Device, [west, south, east, north]: [number, number, number, number]) {
  return request<MapArea>(device, '/api/v1/map_areas', { method: 'POST', body: JSON.stringify({ map_area: { west, south, east, north } }) });
}

// Owner only (403 for hands). Also stops its render on the server if it's still going
export function removeMapArea(device: Device, id: string) {
  return request<void>(device, `/api/v1/map_areas/${id}`, { method: 'DELETE' });
}

export function photoFileUrl(device: Device, photoId: string) {
  return `${device.apiUrl}/api/v1/photos/${photoId}/file`;
}

export function authHeader(device: Device) {
  return { Authorization: `Bearer ${device.token}` };
}
