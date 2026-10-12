import * as Location from 'expo-location';

// A fresh high-accuracy fix, or the last known one if the sky won't give one within 20 s
export async function locate(): Promise<Location.LocationObject | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000));
  const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  return (await Promise.race([fix, timeout])) ?? (await Location.getLastKnownPositionAsync());
}
