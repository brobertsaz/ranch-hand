import * as SecureStore from 'expo-secure-store';

export type Device = {
  apiUrl: string;
  token: string;
  memberId: string;
  ranchName: string;
};

const KEY = 'device';

// The test server on Bob (behind a Cloudflare tunnel). .env.local can point a dev build at a laptop instead.
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://ranch.thebob.dev';

export async function loadDevice(): Promise<Device | null> {
  const json = await SecureStore.getItemAsync(KEY);
  return json ? (JSON.parse(json) as Device) : null;
}

export async function saveDevice(device: Device): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(device));
}

export async function forgetDevice(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export function mapStyleUrl(device: Device): string {
  return `${device.apiUrl}/api/v1/map/style`;
}
