import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import MiniMap from '../components/MiniMap';
import { observationsAt, photosFor, type Observation, type Waypoint } from '../db';
import { relativeTo, timeAgo, type LngLat } from '../format';
import { KIND_INFO, STATUS_LABEL, WAYPOINT_INFO } from '../kinds';
import { useMemberNames, who } from '../members';
import { photoFile } from '../photoFiles';
import { colors, fonts, palette, space } from '../theme';
import GuideScreen, { guideToWaypoint } from './GuideScreen';

type Props = {
  waypoint: Waypoint;
  memberId: string;
  mapStyle: string;
  here: LngLat | null;
  onBack: () => void;
  onOpenObservation: (observation: Observation) => void;
};

// A place that stays put (feed station, tank, gate): its latest status and every check made there
export default function WaypointScreen({ waypoint, memberId, mapStyle, here, onBack, onOpenObservation }: Props) {
  const insets = useSafeAreaInsets();
  const info = WAYPOINT_INFO[waypoint.kind];
  const lngLat: LngLat = [waypoint.longitude, waypoint.latitude];
  const [history, setHistory] = useState<Observation[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [guiding, setGuiding] = useState(false);
  const names = useMemberNames();
  const latest = history[0] ?? null;

  const reload = useCallback(async () => {
    const checks = await observationsAt(waypoint.id);
    setHistory(checks);
    // The newest photo taken here stands in for the place
    for (const check of checks) {
      const file = (await photosFor(check.id)).map((p) => photoFile(p.id)).find((f) => f.exists);
      if (file) return setPhotoUri(file.uri);
    }
    setPhotoUri(null);
  }, [waypoint.id]);

  useEffect(() => {
    reload();
    const sub = addDatabaseChangeListener(reload);
    return () => sub.remove();
  }, [reload]);

  if (guiding) return <GuideScreen target={guideToWaypoint(waypoint)} onBack={() => setGuiding(false)} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
        <View style={[styles.hero, { height: 240 + insets.top }]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Latest photo of ${waypoint.name}`} />
          ) : (
            <View style={styles.heroIcon}>
              <Icon name={info.icon} size={72} color="rgba(245, 239, 224, 0.25)" />
            </View>
          )}
          <View style={styles.heroShade} />
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to map" style={[styles.back, { top: insets.top + 8 }]}>
            <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroText}>
            <View style={styles.badges}>
              <Text style={[styles.badge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.label.toUpperCase()}</Text>
              <Text style={[styles.badge, styles.fixedBadge]}>STAYS PUT</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">{waypoint.name}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <View style={[styles.cardRow, styles.cardDivider]}>
              <View style={[styles.statusDot, { backgroundColor: latest ? KIND_INFO[latest.kind].pinColor : colors.textMuted }]} />
              <View style={styles.flex}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>{latest ? (latest.note ?? 'Checked') : 'No checks yet'}</Text>
                  {latest && <StatusTag status={latest.status} />}
                </View>
                <Text style={styles.cardMeta}>
                  {latest ? `Latest check · ${timeAgo(latest.observed_at)} · ${who(names, latest.member_id, memberId)}` : 'Log one from here next time you ride by'}
                </Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              <MiniMap mapStyle={mapStyle} lngLat={lngLat} color={info.color} square />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{here ? relativeTo(here, lngLat) : 'Saved on the map'}</Text>
                <Text style={styles.cardMeta}>{waypoint._status === 'synced' ? 'The whole crew can see it' : 'On this phone, sends with the next sync'}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.subheading} accessibilityRole="header">History</Text>
          {history.length === 0 && <Text style={styles.cardMeta}>Nothing logged here yet.</Text>}
          {history.map((check) => (
            <Pressable key={check.id} onPress={() => onOpenObservation(check)} accessibilityRole="button" style={styles.historyRow}>
              <View style={[styles.statusDot, { backgroundColor: KIND_INFO[check.kind].pinColor }]} />
              <View style={styles.flex}>
                <View style={styles.titleRow}>
                  <Text style={styles.historyTitle} numberOfLines={2}>{check.note ?? KIND_INFO[check.kind].label}</Text>
                  <StatusTag status={check.status} />
                </View>
                <Text style={styles.cardMeta}>
                  {timeAgo(check.observed_at)} · {who(names, check.member_id, memberId)}
                  {check._status === 'synced' ? '' : ' · on this phone'}
                </Text>
              </View>
              <Icon name="chevronRight" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        <AppButton
          variant="secondary"
          size="large"
          title="Take me there"
          onPress={() => setGuiding(true)}
          icon={<Icon name="navigate" size={24} color={palette.white} strokeWidth={2.2} />}
        />
      </View>
    </View>
  );
}

function StatusTag({ status }: { status: Observation['status'] }) {
  return <Text style={[styles.tag, status === 'open' && styles.tagOpen]}>{STATUS_LABEL[status]}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  hero: { backgroundColor: colors.chrome, justifyContent: 'flex-end' },
  heroIcon: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, backgroundColor: 'rgba(10, 16, 12, 0.55)' },
  back: {
    position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(16, 23, 19, 0.75)', alignItems: 'center', justifyContent: 'center',
  },
  heroText: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 6 },
  badges: { flexDirection: 'row', gap: space.sm },
  badge: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, borderRadius: 4, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 8 },
  fixedBadge: { backgroundColor: palette.canvas, color: palette.pine },
  title: { fontFamily: fonts.displayBlack, fontSize: 44, lineHeight: 44, color: palette.white },
  body: { padding: space.lg, gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  cardDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(23, 27, 24, 0.1)', paddingVertical: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted },
  statusDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: palette.white },
  subheading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: 4 },
  historyRow: {
    minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  tag: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: colors.textMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 4, overflow: 'hidden', paddingVertical: 1, paddingHorizontal: 6,
  },
  tagOpen: { color: palette.white, backgroundColor: palette.trailDark, borderColor: palette.trailDark },
  historyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  actions: {
    paddingTop: 12, paddingHorizontal: space.lg, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: 'rgba(23, 27, 24, 0.12)',
  },
});

