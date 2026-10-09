import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatClock, formatDistance, formatDuration, type LngLat } from '../format';
import { lastFix, trackDistance, type ActiveRide } from '../rides';
import { colors, fonts, palette, radius, space, touch } from '../theme';
import Icon from './Icon';

// A pocket or a glove can bump a button; stopping takes a deliberate hold
const HOLD_MS = 1200;
// An older fix means the phone has lost the sky (or the task stalled)
const STALE_FIX_MS = 60_000;

type Props = {
  ride: ActiveRide;
  track: LngLat[];
  pinsDropped: number;
  onLog: () => void;
  onStop: () => Promise<void>;
  onLayout: (event: LayoutChangeEvent) => void;
};

// Mockup 6 · the ride in progress, over the map in place of the tab bar
export default function RideSheet({ ride, track, pinsDropped, onLog, onStop, onLayout }: Props) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const [fix, setFix] = useState<{ accuracy: number; at: number } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [hint, setHint] = useState(false);
  const hold = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // track is re-read every few seconds by the map, so a new length means a new fix
  useEffect(() => {
    lastFix(ride.id).then(setFix).catch(() => {});
  }, [ride.id, track.length]);

  const gps = fix && now - fix.at < STALE_FIX_MS ? `±${Math.round(fix.accuracy)} m` : 'No fix';

  function pressIn() {
    setHint(false);
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(async ({ finished }) => {
      if (!finished) return;
      setStopping(true);
      try {
        await onStop();
      } finally {
        setStopping(false);
        hold.setValue(0);
      }
    });
  }

  function pressOut() {
    if (stopping) return;
    // Let go early: a tap, not a hold
    hold.stopAnimation((value) => value < 1 && setHint(true));
    Animated.timing(hold, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} onLayout={onLayout}>
      <View style={styles.grabber} />
      <View>
        <Text style={styles.label}>TIME OUT</Text>
        <Text style={styles.clock} accessibilityLabel={`Out for ${formatDuration(now - ride.startedAt)}`}>
          {formatClock(now - ride.startedAt)}
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat value={formatDistance(trackDistance(track))} label="Distance" />
        <Stat value={String(pinsDropped)} label="Pins dropped" />
        <Stat value={gps} label="GPS" />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPressIn={pressIn}
          onPressOut={pressOut}
          disabled={stopping}
          accessibilityRole="button"
          accessibilityLabel="Hold to stop the ride"
          accessibilityActions={[{ name: 'activate' }]}
          // Screen readers can't hold; a double-tap stops it
          onAccessibilityAction={() => onStop()}
          style={styles.stop}
        >
          <Animated.View style={[styles.stopFill, { width: hold.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          <View style={styles.stopSquare} />
          <Text style={styles.stopText}>{stopping ? 'Saving…' : hint ? 'Keep holding' : 'Hold to stop'}</Text>
        </Pressable>
        <Pressable onPress={onLog} accessibilityRole="button" style={({ pressed }) => [styles.log, pressed && styles.pressed]}>
          <Icon name="camera" size={26} color={palette.white} strokeWidth={2.2} />
          <Text style={styles.logText}>Log what you see</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// The little pill that replaces the map header while recording
export function RecordingPill() {
  return (
    <View style={styles.pill} accessibilityRole="text" accessibilityLabel="Recording ride">
      <View style={styles.pillHalo}>
        <View style={styles.pillDot} />
      </View>
      <Text style={styles.pillText}>RECORDING RIDE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.chrome,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingHorizontal: space.lg, gap: space.lg,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(245, 239, 224, 0.3)' },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: colors.chromeTextMuted },
  clock: { fontFamily: fonts.displayBlack, fontSize: 72, lineHeight: 72, color: colors.chromeText, fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', gap: 1, backgroundColor: 'rgba(245, 239, 224, 0.14)', borderRadius: 12, overflow: 'hidden' },
  stat: { flex: 1, backgroundColor: colors.chromeRaised, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.chromeText },
  statLabel: { fontSize: 12, color: colors.chromeTextMuted },
  actions: { flexDirection: 'row', gap: 10 },
  stop: {
    flex: 1, height: touch.primary, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(245, 239, 224, 0.4)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden',
  },
  stopFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(245, 239, 224, 0.22)' },
  stopSquare: { width: 16, height: 16, borderRadius: 3, backgroundColor: colors.chromeText },
  stopText: { fontSize: 17, fontWeight: '800', color: colors.chromeText },
  log: {
    flex: 1.4, height: touch.primary, borderRadius: 12, backgroundColor: palette.trailDark,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  pressed: { opacity: 0.85 },
  logText: { fontFamily: fonts.display, fontSize: 24, color: palette.white },
  pill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.chrome,
    borderRadius: radius.pill, paddingVertical: 10, paddingLeft: 12, paddingRight: 16,
  },
  pillHalo: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(207, 74, 46, 0.3)', alignItems: 'center', justifyContent: 'center' },
  pillDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.trail },
  pillText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.6, color: colors.chromeText },
});
