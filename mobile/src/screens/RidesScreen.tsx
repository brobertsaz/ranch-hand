import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AppButton from '../components/AppButton';
import FieldHeader from '../components/FieldHeader';
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

  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = rides.filter((ride) => ride.started_at >= weekAgo);
  const miles = thisWeek.reduce((sum, ride) => sum + ride.distance_meters, 0) / 1609.34;
  const hours = thisWeek.reduce((sum, ride) => sum + (ride.ended_at - ride.started_at), 0) / 3_600_000;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FieldHeader
        eyebrow="THE LAST 7 DAYS"
        title="Rides"
        stats={[
          { value: String(thisWeek.length), label: thisWeek.length === 1 ? 'Ride' : 'Rides' },
          { value: miles < 10 ? miles.toFixed(1) : String(Math.round(miles)), label: 'Miles' },
          { value: hours < 10 ? hours.toFixed(1) : String(Math.round(hours)), label: 'Hours out' },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + space.xl }]}>

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

        <View style={styles.subheadingRow}>
          <Text style={styles.subheading} accessibilityRole="header">RECENT RIDES</Text>
          <View style={styles.rule} />
        </View>
        {rides.length === 0 && <Text style={styles.empty}>No rides yet.</Text>}
        {rides.map((ride) => (
          <Pressable key={ride.id} onPress={() => onShowRide(ride.id)} accessibilityRole="button" accessibilityHint="Shows the track on the map" style={styles.ride}>
            <View style={styles.rideIcon}>
              <Icon name="rides" size={30} color={palette.white} strokeWidth={2.2} />
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
  content: { paddingHorizontal: 14, paddingTop: 16, gap: space.md },
  startCard: { backgroundColor: colors.surface, borderRadius: 18, padding: space.lg, gap: space.md, borderBottomWidth: 2, borderBottomColor: colors.hairline },
  startText: { fontSize: 17, lineHeight: 24, color: colors.text },
  subheadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.sm },
  subheading: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2.4, color: colors.textMuted },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  empty: { fontSize: 15, color: colors.textMuted },
  ride: {
    minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10,
    backgroundColor: colors.surface, borderRadius: 16, borderBottomWidth: 2, borderBottomColor: colors.hairline,
  },
  rideIcon: { width: 64, height: 64, borderRadius: 12, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  rideText: { flex: 1, gap: 2 },
  rideTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: colors.text },
  rideMeta: { fontSize: 14, color: colors.textMuted },
  showOnMap: { fontSize: 14, fontWeight: '700', color: palette.sky },
});

