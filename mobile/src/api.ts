import type { Device } from './settings';
import type { Changes } from './sync';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(device: Pick<Device, 'apiUrl'> & Partial<Device>, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${device.apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(device.token ? { Authorization: `Bearer ${device.token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new ApiError(response.status, `${init.method ?? 'GET'} ${path} failed: ${response.status}`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function joinRanch(apiUrl: string, inviteCode: string, name: string) {
  return request<{ token: string; member_id: string; ranch: { id: string; name: string } }>({ apiUrl }, '/api/v1/devices', {
    method: 'POST',
    body: JSON.stringify({ invite_code: inviteCode, name }),
  });
}

export function pullChanges(device: Device, lastPulledAt: number | null) {
  const query = lastPulledAt ? `?last_pulled_at=${lastPulledAt}` : '';
  return request<{ changes: Changes; timestamp: number }>(device, `/api/v1/sync${query}`);
}

export function pushChanges(device: Device, changes: Changes) {
  return request<void>(device, '/api/v1/sync', { method: 'POST', body: JSON.stringify({ changes }) });
}

export function fetchRanch(device: Device) {
  return request<{ id: string; name: string; invite_code: string }>(device, '/api/v1/ranch');
}

export function photoFileUrl(device: Device, photoId: string) {
  return `${device.apiUrl}/api/v1/photos/${photoId}/file`;
}

export function authHeader(device: Device) {
  return { Authorization: `Bearer ${device.token}` };
}
