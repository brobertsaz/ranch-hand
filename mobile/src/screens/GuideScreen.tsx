import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import Icon from '../components/Icon';
import type { Observation, Waypoint } from '../db';
import { bearingDegrees, compassPoint, distanceMeters, formatDistance, timeAgo, type LngLat } from '../format';
import { KIND_INFO, WAYPOINT_INFO } from '../kinds';
import { colors, fonts, palette, space, sync } from '../theme';

// What the arrow points at, and how to talk about it
export type GuideTarget = {
  lngLat: LngLat;
  title: string;
  badge: string;
  badgeColor: string;
  badgeText: string;
  moves: boolean | null;
  caveat: string;
  arrivedTitle: string;
  arrivedNote: string;
};

export function guideToObservation(observation: Observation): GuideTarget {
  const info = KIND_INFO[observation.kind];
  const seen = timeAgo(observation.observed_at);
  return {
    lngLat: [observation.longitude, observation.latitude],
    title: observation.tag_number ? `Tag ${observation.tag_number}` : info.label,
    badge: info.badge,
    badgeColor: info.badgeColor,
    badgeText: info.onColor,
    moves: info.moves,
    caveat:
      info.moves === true
        ? `Last seen here ${seen}. Animals move, so look around as you get close.`
        : info.moves === false
          ? `${info.label} spots stay put. Logged ${seen}.`
          : `Logged here ${seen}.`,
    arrivedTitle: info.moves ? 'Look around' : "You're here",
    arrivedNote: info.moves ? `It was right about here ${seen}.` : 'This is the spot.',
  };
}

export function guideToWaypoint(waypoint: Waypoint): GuideTarget {
  const info = WAYPOINT_INFO[waypoint.kind];
  return {
    lngLat: [waypoint.longitude, waypoint.latitude],
    title: waypoint.name,
    badge: info.label.toUpperCase(),
    badgeColor: info.badgeColor,
    badgeText: info.onColor,
    moves: false,
    caveat: `${waypoint.name} is a fixed place, so it'll be right where the pin is.`,
    arrivedTitle: "You're here",
    arrivedNote: `This is ${waypoint.name}.`,
  };
}

type Props = { target: GuideTarget; onBack: () => void };

// Close enough to stop following the arrow and start looking around
const ARRIVED_MIN_METERS = 15;
const ARRIVED_MAX_METERS = 50;
// Below this, GPS course jumps around too much to steer by
const MOVING_METERS_PER_SECOND = 1;

// "Take me there": a straight-line arrow to the pin, video-game style.
// No roads or routes (there aren't any out there), just GPS plus the compass, so it works with no signal.
export default function GuideScreen({ target: guide, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const target = guide.lngLat;
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

  const here: LngLat | null = fix ? [fix.coords.longitude, fix.coords.latitude] : null;
  const meters = here ? distanceMeters(here, target) : null;
  const bearing = here ? bearingDegrees(here, target) : null;
  const accuracy = fix?.coords.accuracy ?? null;
  const arrived = meters !== null && meters <= Math.min(ARRIVED_MAX_METERS, Math.max(ARRIVED_MIN_METERS, accuracy ?? 0));

  // Which way the phone points: compass first, then GPS course when riding, else unknown
  const compassHeading = compass ? (compass.trueHeading >= 0 ? compass.trueHeading : compass.magHeading) : null;
  const course = fix && (fix.coords.speed ?? 0) > MOVING_METERS_PER_SECOND && (fix.coords.heading ?? -1) >= 0 ? fix.coords.heading : null;
  const facing = compassHeading ?? course;
  // Without a heading the arrow is north-up, like a paper map
  const arrowAngle = bearing === null ? null : bearing - (facing ?? 0);
  const calibrate = compass !== null && compass.accuracy <= 1;

  const rotation = useRef(new Animated.Value(0)).current;
  const shownAngle = useRef(0);
  useEffect(() => {
    if (arrowAngle === null) return;
    // Turn the short way round, so crossing north doesn't spin the arrow a full circle
    const delta = ((((arrowAngle - shownAngle.current) % 360) + 540) % 360) - 180;
    shownAngle.current += delta;
    Animated.timing(rotation, { toValue: shownAngle.current, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [arrowAngle, rotation]);
  const rotate = rotation.interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + space.lg }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to the observation" style={styles.back}>
          <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.badge, { backgroundColor: guide.badgeColor, color: guide.badgeText }]}>{guide.badge}</Text>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {guide.title}
          </Text>
        </View>
      </View>

      <View style={styles.middle}>
        {error ? (
          <Text style={styles.message}>{error}</Text>
        ) : meters === null ? (
          <Text style={styles.message}>Finding your position…</Text>
        ) : arrived ? (
          <View style={styles.arrived} accessible accessibilityLabel={`${guide.arrivedTitle}. ${guide.arrivedNote}`}>
            <View style={styles.arrivedRing}>
              <Icon name="check" size={96} color={palette.white} strokeWidth={2.8} />
            </View>
            <Text style={styles.distance}>{guide.arrivedTitle}</Text>
            <Text style={styles.instruction}>{guide.arrivedNote}</Text>
          </View>
        ) : (
          <View style={styles.pointer} accessible accessibilityLabel={`${turnHint(arrowAngle, facing !== null)}. ${formatDistance(meters)} to go, heading ${compassPoint(bearing ?? 0)}.`}>
            <View style={styles.dial}>
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Svg width={200} height={200} viewBox="0 0 24 24">
                  <Path d="M12 2L20 21L12 16.5L4 21Z" fill={palette.trail} stroke={palette.white} strokeWidth={1.2} strokeLinejoin="round" />
                </Svg>
              </Animated.View>
            </View>
            <Text style={styles.distance}>{formatDistance(meters)}</Text>
            <Text style={styles.instruction}>
              {turnHint(arrowAngle, facing !== null)} · head {compassPoint(bearing ?? 0)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.caveat}>{guide.caveat}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: accuracy === null ? sync.pending : accuracy <= 20 ? sync.synced : sync.pending }]} />
          <Text style={styles.status}>{accuracy === null ? 'Waiting for GPS' : `GPS ±${Math.round(accuracy)} m`}</Text>
          <View style={[styles.dot, { backgroundColor: facing === null || calibrate ? sync.pending : sync.synced }]} />
          <Text style={styles.status}>{facing === null ? 'No compass, arrow is north-up' : compassHeading === null ? 'Steering by your direction of travel' : 'Compass on'}</Text>
        </View>
        {calibrate && <Text style={styles.status}>Compass is unsure. Move the phone in a figure 8 to calibrate it.</Text>}
      </View>
    </View>
  );
}

// Plain words for the arrow, for a quick glance and for screen readers
function turnHint(angle: number | null, hasHeading: boolean): string {
  if (angle === null || !hasHeading) return 'Follow the arrow';
  const a = ((((angle % 360) + 540) % 360) - 180); // -180..180, negative is left
  const side = a < 0 ? 'left' : 'right';
  const abs = Math.abs(a);
  if (abs <= 15) return 'Straight ahead';
  if (abs <= 60) return `Bear ${side}`;
  if (abs <= 135) return `Turn ${side}`;
  return 'Turn around';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.chrome, paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.chromeRaised, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  badge: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, borderRadius: 4, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 8 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: colors.chromeText },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { color: colors.chromeText, fontSize: 18, textAlign: 'center' },
  pointer: { alignItems: 'center', gap: space.md },
  dial: {
    width: 260, height: 260, borderRadius: 130, backgroundColor: colors.chromeRaised,
    borderWidth: 2, borderColor: 'rgba(245, 239, 224, 0.15)', alignItems: 'center', justifyContent: 'center',
  },
  arrived: { alignItems: 'center', gap: space.md },
  arrivedRing: { width: 200, height: 200, borderRadius: 100, backgroundColor: sync.synced, alignItems: 'center', justifyContent: 'center' },
  distance: { fontFamily: fonts.displayBlack, fontSize: 64, lineHeight: 66, color: colors.chromeText },
  instruction: { fontSize: 20, fontWeight: '700', color: colors.chromeText, textAlign: 'center' },
  footer: { backgroundColor: colors.chromeRaised, borderRadius: 14, padding: space.lg, gap: 10 },
  caveat: { fontSize: 16, lineHeight: 22, color: colors.chromeText },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 4 },
  status: { fontSize: 13, color: colors.chromeTextMuted },
});
