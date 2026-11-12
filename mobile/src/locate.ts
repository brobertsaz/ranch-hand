import * as Location from 'expo-location';

// Android asks to switch on Google's Location Accuracy (Wi-Fi and cell positioning) and gives no fix at all if the
// hand says no. Out past the signal that service has nothing to add, so take plain GPS and don't ask.
export const GPS_ONLY_OK = { mayShowUserSettingsDialog: false } as const;

// How old and how loose a last-known position can be and still stand in for a fresh fix. On horseback a
// minute is a hundred yards or so; anything older or vaguer would put a pin in the wrong pasture.
const LAST_KNOWN_MAX_AGE_MS = 60_000;
const LAST_KNOWN_MAX_METERS = 100;

// stale: not a fresh fix but the phone's last known position, recent and tight enough to use. Say so on screen.
export type Located = { fix: Location.LocationObject; stale: boolean };

// A fresh high-accuracy fix. If the sky won't give one in time, the last known position, but only a recent,
// accurate one. Null means there's nothing honest to offer.
export async function locate(timeoutMs = 20_000): Promise<Located | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, ...GPS_ONLY_OK }).catch(() => null);
  const fix = await Promise.race([fresh, timeout]);
  if (fix) return { fix, stale: false };
  const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: LAST_KNOWN_MAX_METERS }).catch(() => null);
  return last ? { fix: last, stale: true } : null;
}
