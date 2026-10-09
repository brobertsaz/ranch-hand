import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type { Waypoint } from '../db';
import { bearingDegrees, formatDistance, type LngLat } from '../format';
import { WAYPOINT_INFO } from '../kinds';
import { colors, fonts, palette, space, sync, touch } from '../theme';
import { cumulative, locateOnTrack, ON_TRAIL_METERS, placesOnTrail } from '../trail';
import { turnHint, useArrowRotation, useHeading } from '../useHeading';
import Icon from './Icon';

// On the trail, the arrow points this far ahead along it, so it follows the bends
const LOOK_AHEAD_METERS = 40;
// Places just behind you still count as "here" for a moment
const PASSED_METERS = 20;

type Props = {
  title: string;
  track: LngLat[];
  waypoints: Waypoint[];
  onStop: () => void;
  onLog: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
};

// Follow a ride someone saved: stay on their track, see the gates and water it passes
export default function FollowSheet({ title, track, waypoints, onStop, onLog, onLayout }: Props) {
  const insets = useSafeAreaInsets();
  const { here, accuracy, facing, hasCompass, error } = useHeading();
  const along = useMemo(() => cumulative(track), [track]);
  const total = along.at(-1) ?? 0;
  const places = useMemo(() => placesOnTrail(track, along, waypoints), [track, along, waypoints]);

  const position = here ? locateOnTrack(track, along, here) : null;
  const onTrail = position !== null && position.offMeters <= Math.max(ON_TRAIL_METERS, accuracy ?? 0);
  const remaining = position ? Math.max(0, total - position.alongMeters) : total;
  const atEnd = onTrail && remaining <= ON_TRAIL_METERS;

  // Off the trail: back to the nearest point. On it: a little way ahead.
  const aim: LngLat | null = !position ? null : onTrail ? pointAt(track, along, position.alongMeters + LOOK_AHEAD_METERS) : position.nearest;
  const bearing = here && aim ? bearingDegrees(here, aim) : null;
  const arrowAngle = bearing === null ? null : bearing - (facing ?? 0);
  const rotate = useArrowRotation(arrowAngle);

  const ahead = places.filter((p) => !position || p.alongMeters >= position.alongMeters - PASSED_METERS).slice(0, 2);

  const headline = error
    ? error
    : !position
      ? 'Finding you…'
      : atEnd
        ? 'End of the ride'
        : onTrail
          ? 'On the trail'
          : `${formatDistance(position.offMeters)} off the trail`;
  const subline = !position || atEnd ? '' : `${turnHint(arrowAngle, facing !== null)} · ${formatDistance(remaining)} to the end`;

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} onLayout={onLayout}>
      <View style={styles.grabber} />
      <View>
        <Text style={styles.label}>FOLLOWING</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <View style={styles.status} accessible accessibilityLabel={`${headline}. ${subline}`}>
        <View style={[styles.dial, onTrail && styles.dialOn]}>
          {atEnd ? (
            <Icon name="check" size={40} color={palette.white} strokeWidth={2.8} />
          ) : (
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Svg width={52} height={52} viewBox="0 0 24 24">
                <Path d="M12 2L20 21L12 16.5L4 21Z" fill={onTrail ? palette.white : palette.trail} stroke={palette.white} strokeWidth={1.2} strokeLinejoin="round" />
              </Svg>
            </Animated.View>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.headline}>{headline}</Text>
          {subline !== '' && <Text style={styles.subline}>{subline}</Text>}
          <Text style={styles.meta}>
            {accuracy === null ? 'Waiting for GPS' : `GPS ±${Math.round(accuracy)} m`}
            {facing === null ? ' · no compass, arrow is north-up' : hasCompass ? '' : ' · steering by travel'}
          </Text>
        </View>
      </View>

      {ahead.length > 0 && (
        <View style={styles.places}>
          {ahead.map(({ waypoint, alongMeters }) => {
            const info = WAYPOINT_INFO[waypoint.kind];
            const to = position ? alongMeters - position.alongMeters : alongMeters;
            return (
              <View key={waypoint.id} style={styles.place}>
                <View style={[styles.placeIcon, { backgroundColor: info.color }]}>
                  <Icon name={info.icon} size={18} color={info.onColor} strokeWidth={2.4} />
                </View>
                <Text style={styles.placeName} numberOfLines={1}>{waypoint.name}</Text>
                <Text style={styles.placeDistance}>{to <= PASSED_METERS ? 'Here' : `in ${formatDistance(to)}`}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable onPress={onStop} accessibilityRole="button" style={styles.stop}>
          <Icon name="close" size={20} color={colors.chromeText} strokeWidth={2.6} />
          <Text style={styles.stopText}>Stop following</Text>
        </Pressable>
        <Pressable onPress={onLog} accessibilityRole="button" style={({ pressed }) => [styles.log, pressed && styles.pressed]}>
          <Icon name="camera" size={26} color={palette.white} strokeWidth={2.2} />
          <Text style={styles.logText}>Log what you see</Text>
        </Pressable>
      </View>
    </View>
  );
}

// The track point `meters` along from the start (or its last point)
function pointAt(track: LngLat[], along: number[], meters: number): LngLat {
  const i = along.findIndex((d) => d >= meters);
  return i === -1 ? track[track.length - 1] : track[i];
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.chrome,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingHorizontal: space.lg, gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(245, 239, 224, 0.3)' },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: colors.chromeTextMuted },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: colors.chromeText },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1, gap: 2 },
  dial: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.chromeRaised,
    borderWidth: 2, borderColor: 'rgba(245, 239, 224, 0.15)', alignItems: 'center', justifyContent: 'center',
  },
  dialOn: { backgroundColor: sync.synced, borderColor: sync.synced },
  headline: { fontFamily: fonts.displayBlack, fontSize: 32, lineHeight: 34, color: colors.chromeText },
  subline: { fontSize: 16, fontWeight: '700', color: colors.chromeText },
  meta: { fontSize: 13, color: colors.chromeTextMuted },
  places: { backgroundColor: colors.chromeRaised, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12 },
  place: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeIcon: { width: 28, height: 28, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  placeName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.chromeText },
  placeDistance: { fontSize: 15, fontWeight: '700', color: colors.chromeTextMuted },
  actions: { flexDirection: 'row', gap: 10 },
  stop: {
    flex: 1, height: touch.primary, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(245, 239, 224, 0.4)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  stopText: { fontSize: 17, fontWeight: '800', color: colors.chromeText },
  log: {
    flex: 1.4, height: touch.primary, borderRadius: 12, backgroundColor: palette.trailDark,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  pressed: { opacity: 0.85 },
  logText: { fontFamily: fonts.display, fontSize: 24, color: palette.white },
});
