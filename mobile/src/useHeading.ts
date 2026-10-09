import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

import type { LngLat } from './format';

// Below this, GPS course jumps around too much to steer by
const MOVING_METERS_PER_SECOND = 1;

export type Heading = {
  here: LngLat | null;
  accuracy: number | null;
  // Which way the phone points: compass first, then GPS course when riding, else unknown
  facing: number | null;
  hasCompass: boolean;
  // The compass says it needs a figure 8
  calibrate: boolean;
  error: string | null;
};

// A live GPS fix plus the compass, for pointing arrows. Works with no signal.
export function useHeading(): Heading {
  const [fix, setFix] = useState<Location.LocationObject | null>(null);
  const [compass, setCompass] = useState<Location.LocationHeadingObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let position: Location.LocationSubscription | null = null;
    let heading: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setError('Ranch Hand needs Location to point the way.');
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) setFix(last);
      position = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
        (next) => setFix(next),
        () => setError('Lost the GPS fix. Step into the open.'),
      );
      heading = await Location.watchHeadingAsync((next) => setCompass(next)).catch(() => null);
      if (cancelled) {
        position?.remove();
        heading?.remove();
      }
    })();

    return () => {
      cancelled = true;
      position?.remove();
      heading?.remove();
    };
  }, []);

  const compassHeading = compass ? (compass.trueHeading >= 0 ? compass.trueHeading : compass.magHeading) : null;
  const course = fix && (fix.coords.speed ?? 0) > MOVING_METERS_PER_SECOND && (fix.coords.heading ?? -1) >= 0 ? fix.coords.heading : null;

  return {
    here: fix ? [fix.coords.longitude, fix.coords.latitude] : null,
    accuracy: fix?.coords.accuracy ?? null,
    facing: compassHeading ?? course,
    hasCompass: compassHeading !== null,
    calibrate: compass !== null && compass.accuracy <= 1,
    error,
  };
}

// Spins an arrow to `angle`, turning the short way round so crossing north doesn't spin it a full circle
export function useArrowRotation(angle: number | null) {
  const rotation = useRef(new Animated.Value(0)).current;
  const shown = useRef(0);
  useEffect(() => {
    if (angle === null) return;
    const delta = ((((angle - shown.current) % 360) + 540) % 360) - 180;
    shown.current += delta;
    Animated.timing(rotation, { toValue: shown.current, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [angle, rotation]);
  return rotation.interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] });
}

// Plain words for the arrow, for a quick glance and for screen readers
export function turnHint(angle: number | null, hasHeading: boolean): string {
  if (angle === null || !hasHeading) return 'Follow the arrow';
  const a = ((((angle % 360) + 540) % 360) - 180); // -180..180, negative is left
  const side = a < 0 ? 'left' : 'right';
  const abs = Math.abs(a);
  if (abs <= 15) return 'Straight ahead';
  if (abs <= 60) return `Bear ${side}`;
  if (abs <= 135) return `Turn ${side}`;
  return 'Turn around';
}
