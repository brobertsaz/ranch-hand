import { StatusBar } from 'expo-status-bar';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import Icon from '../components/Icon';
import type { Observation, Waypoint } from '../db';
import { bearingDegrees, compassPoint, distanceMeters, formatDistance, timeAgo, type LngLat } from '../format';
import { KIND_INFO, WAYPOINT_INFO } from '../kinds';
import { colors, fonts, palette, space, sync } from '../theme';
import { turnHint, useArrowRotation, useHeading } from '../useHeading';

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

// "Take me there": a straight-line arrow to the pin, video-game style.
// No roads or routes (there aren't any out there), just GPS plus the compass, so it works with no signal.
export default function GuideScreen({ target: guide, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const target = guide.lngLat;
  const { here, accuracy, facing, hasCompass, calibrate, error } = useHeading();
  const meters = here ? distanceMeters(here, target) : null;
  const bearing = here ? bearingDegrees(here, target) : null;
  const arrived = meters !== null && meters <= Math.min(ARRIVED_MAX_METERS, Math.max(ARRIVED_MIN_METERS, accuracy ?? 0));

  // Without a heading the arrow is north-up, like a paper map
  const arrowAngle = bearing === null ? null : bearing - (facing ?? 0);
  const rotate = useArrowRotation(arrowAngle);

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
          <Text style={styles.status}>{facing === null ? 'No compass, arrow is north-up' : !hasCompass ? 'Steering by your direction of travel' : 'Compass on'}</Text>
        </View>
        {calibrate && <Text style={styles.status}>Compass is unsure. Move the phone in a figure 8 to calibrate it.</Text>}
      </View>
    </View>
  );
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
