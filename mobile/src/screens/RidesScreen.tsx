import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import { useTabBarHeight } from '../components/TabBar';
import { liveRides, type Ride } from '../db';
import { dayAndTime, formatDistance, formatDuration } from '../format';
import { useMemberNames, who } from '../members';
import { colors, fonts, palette, space } from '../theme';

type Props = {
  memberId: string;
  riding: boolean;
  onStart: () => Promise<void>;
  onBackToRide: () => void;
  onShowRide: (rideId: string) => void;
};

// Start a ride (it records on the map) and look back at the crew's
export default function RidesScreen({ memberId, riding, onStart, onBackToRide, onShowRide }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const names = useMemberNames();
  const [rides, setRides] = useState<Ride[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    liveRides().then(setRides);
  }, []);

  useEffect(() => {
    reload();
    const sub = addDatabaseChangeListener(({ tableName }) => tableName === 'rides' && reload());
    return () => sub.remove();
  }, [reload]);

  async function start() {
    setBusy(true);
    try {
      await onStart();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + space.xl }]}>
        <Text style={styles.title} accessibilityRole="header">Rides</Text>

        <View style={styles.startCard}>
          <Text style={styles.startText}>
            {riding
              ? 'A ride is recording.'
              : 'Record where you ride, so the crew can see which pastures got checked. Keeps recording with the phone in your pocket, with no signal.'}
          </Text>
          <AppButton
            size="large"
            title={riding ? 'Back to the ride' : busy ? 'Starting…' : 'Start a ride'}
            onPress={riding ? onBackToRide : start}
            disabled={busy}
            icon={<Icon name="rides" size={26} color={palette.white} strokeWidth={2.2} />}
          />
        </View>

        <Text style={styles.subheading} accessibilityRole="header">Recent rides</Text>
        {rides.length === 0 && <Text style={styles.empty}>No rides yet.</Text>}
        {rides.map((ride) => (
          <Pressable key={ride.id} onPress={() => onShowRide(ride.id)} accessibilityRole="button" accessibilityHint="Shows the track on the map" style={styles.ride}>
            <View style={styles.rideIcon}>
              <Icon name="rides" size={22} color={palette.white} />
            </View>
            <View style={styles.rideText}>
              <Text style={styles.rideTitle} numberOfLines={2}>
                {ride.name ?? `${who(names, ride.member_id, memberId)} · ${formatDistance(ride.distance_meters)}`}
              </Text>
              <Text style={styles.rideMeta}>
                {ride.name ? `${who(names, ride.member_id, memberId)} · ${formatDistance(ride.distance_meters)} · ` : ''}
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
  subheading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: space.md },
  empty: { fontSize: 15, color: colors.textMuted },
  ride: {
    minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  rideIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  rideText: { flex: 1, gap: 2 },
  rideTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rideMeta: { fontSize: 13, color: colors.textMuted },
  showOnMap: { fontSize: 14, fontWeight: '700', color: palette.sky },
});

