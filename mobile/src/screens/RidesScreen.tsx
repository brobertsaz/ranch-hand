import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import { useTabBarHeight } from '../components/TabBar';
import { liveRides, type Ride } from '../db';
import { dayAndTime, formatClock, formatDistance, formatDuration } from '../format';
import { useMemberNames, who } from '../members';
import { activeRide, resumeRideIfNeeded, ridePoints, startRide, stopRide, trackDistance, type ActiveRide } from '../rides';
import { colors, fonts, palette, space } from '../theme';

type Props = { memberId: string; onShowRide: (rideId: string) => void; onRideSaved: () => void };

// Start and stop a ride, and look back at the crew's
export default function RidesScreen({ memberId, onShowRide, onRideSaved }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const names = useMemberNames();
  const [active, setActive] = useState<ActiveRide | null>(null);
  const [live, setLive] = useState({ points: 0, meters: 0 });
  const [now, setNow] = useState(Date.now());
  const [rides, setRides] = useState<Ride[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    liveRides().then(setRides);
    activeRide().then(setActive);
  }, []);

  useEffect(() => {
    reload();
    resumeRideIfNeeded().catch(() => {});
    const sub = addDatabaseChangeListener(({ tableName }) => tableName === 'rides' && reload());
    return () => sub.remove();
  }, [reload]);

  // While riding: tick the clock every second, re-read the track every few
  useEffect(() => {
    if (!active) return;
    const refresh = () => ridePoints(active.id).then((track) => setLive({ points: track.length, meters: trackDistance(track) }));
    refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const track = setInterval(refresh, 5000);
    return () => {
      clearInterval(clock);
      clearInterval(track);
    };
  }, [active]);

  async function start() {
    setBusy(true);
    try {
      setActive(await startRide());
      setLive({ points: 0, meters: 0 });
    } catch (error) {
      Alert.alert("Couldn't start the ride", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      const saved = await stopRide(memberId);
      setActive(null);
      if (saved) onRideSaved();
      else Alert.alert('Nothing to save', "The phone didn't get enough GPS fixes to draw a track.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + space.xl }]}>
        <Text style={styles.title} accessibilityRole="header">Rides</Text>

        {active ? (
          <View style={styles.activeCard}>
            <View style={styles.recordingRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording</Text>
            </View>
            <Text style={styles.clock} accessibilityLabel={`Riding for ${formatDuration(now - active.startedAt)}`}>
              {formatClock(now - active.startedAt)}
            </Text>
            <Text style={styles.activeStats}>
              {formatDistance(live.meters)} · {live.points} GPS fixes
            </Text>
            <Text style={styles.activeHint}>Keeps recording with the phone in your pocket. Works with no signal.</Text>
            <AppButton size="large" title={busy ? 'Saving…' : 'Stop ride'} onPress={stop} disabled={busy} />
          </View>
        ) : (
          <View style={styles.startCard}>
            <Text style={styles.startText}>Record where you ride, so the crew can see which pastures got checked.</Text>
            <AppButton
              size="large"
              title={busy ? 'Starting…' : 'Start a ride'}
              onPress={start}
              disabled={busy}
              icon={<Icon name="rides" size={26} color={palette.white} strokeWidth={2.2} />}
            />
          </View>
        )}

        <Text style={styles.subheading} accessibilityRole="header">Recent rides</Text>
        {rides.length === 0 && <Text style={styles.empty}>No rides yet.</Text>}
        {rides.map((ride) => (
          <Pressable key={ride.id} onPress={() => onShowRide(ride.id)} accessibilityRole="button" accessibilityHint="Shows the track on the map" style={styles.ride}>
            <View style={styles.rideIcon}>
              <Icon name="rides" size={22} color={palette.white} />
            </View>
            <View style={styles.rideText}>
              <Text style={styles.rideTitle}>
                {who(names, ride.member_id, memberId)} · {formatDistance(ride.distance_meters)}
              </Text>
              <Text style={styles.rideMeta}>
                {dayAndTime(ride.started_at)} · {formatDuration(ride.ended_at - ride.started_at)}
                {ride._status === 'synced' ? '' : ' · on this phone'}
              </Text>
            </View>
            <Text style={styles.showOnMap}>Show on map</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.text },
  startCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: space.lg, gap: space.md },
  startText: { fontSize: 17, lineHeight: 24, color: colors.text },
  activeCard: { backgroundColor: colors.chrome, borderRadius: 14, padding: space.lg, gap: space.sm },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.trail },
  recordingText: { color: colors.chromeText, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  clock: { fontFamily: fonts.displayBlack, fontSize: 64, lineHeight: 68, color: colors.chromeText },
  activeStats: { fontSize: 18, fontWeight: '700', color: colors.chromeText },
  activeHint: { fontSize: 14, color: colors.chromeTextMuted, marginBottom: space.sm },
  subheading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: space.md },
  empty: { fontSize: 15, color: colors.textMuted },
  ride: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  rideIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  rideText: { flex: 1, gap: 2 },
  rideTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rideMeta: { fontSize: 13, color: colors.textMuted },
  showOnMap: { fontSize: 14, fontWeight: '700', color: palette.sky },
});

