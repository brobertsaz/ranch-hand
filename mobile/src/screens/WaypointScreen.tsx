import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import { Contours } from '../components/FieldHeader';
import Stamp from '../components/Stamp';
import Icon from '../components/Icon';
import MiniMap from '../components/MiniMap';
import PlaceSheet from '../components/PlaceSheet';
import { deleteWaypoint, observationsAt, photosFor, updateWaypoint, type Observation, type Waypoint } from '../db';
import { relativeTo, timeAgo, type LngLat } from '../format';
import { KIND_INFO, STATUS_LABEL, WAYPOINT_INFO } from '../kinds';
import { locate } from '../locate';
import { useIsOwner, useMemberNames, who } from '../members';
import { photoFile } from '../photoFiles';
import { colors, fonts, palette, space, touch } from '../theme';
import GuideScreen, { guideToWaypoint } from './GuideScreen';

type Props = {
  waypoint: Waypoint;
  memberId: string;
  mapStyle: string;
  here: LngLat | null;
  onBack: () => void;
  onOpenObservation: (observation: Observation) => void;
  // Closes this screen so the hand can put the place under the map's crosshair
  onMoveOnMap: (waypoint: Waypoint) => void;
  onChanged: () => void;
};

// A place that stays put (feed station, tank, gate): its latest status and every check made there
export default function WaypointScreen({ waypoint, memberId, mapStyle, here, onBack, onOpenObservation, onMoveOnMap, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const info = WAYPOINT_INFO[waypoint.kind];
  const lngLat: LngLat = [waypoint.longitude, waypoint.latitude];
  const [history, setHistory] = useState<Observation[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [guiding, setGuiding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const names = useMemberNames();
  const isOwner = useIsOwner(memberId);
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

  async function moveHere() {
    setMoving(true);
    const fix = await locate().catch(() => null);
    setMoving(false);
    if (!fix) return Alert.alert('No GPS fix', 'Step into the open and try again, or move it on the map.');
    await updateWaypoint(waypoint.id, { latitude: fix.coords.latitude, longitude: fix.coords.longitude });
    onChanged();
    Alert.alert('Moved', `${waypoint.name} is now where you're standing (±${Math.round(fix.coords.accuracy ?? 0)} m).`);
  }

  function chooseMove() {
    Alert.alert(`Move ${waypoint.name}`, 'Put it where it really is.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'On the map', onPress: () => onMoveOnMap(waypoint) },
      { text: "Where I'm standing", onPress: moveHere },
    ]);
  }

  function confirmDelete() {
    const checks = history.length > 0 ? ` The ${history.length} check${history.length === 1 ? '' : 's'} made here stay on the map.` : '';
    Alert.alert(`Delete ${waypoint.name}?`, `It goes for the whole crew.${checks}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteWaypoint(waypoint.id);
          onChanged();
          onBack();
        },
      },
    ]);
  }

  if (guiding) return <GuideScreen target={guideToWaypoint(waypoint)} onBack={() => setGuiding(false)} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
        <View style={[styles.hero, { height: 290 + insets.top }]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Latest photo of ${waypoint.name}`} />
          ) : (
            <>
              <Contours />
              <View style={[styles.heroIcon, { paddingTop: insets.top }]}>
                <Icon name={info.icon} size={120} color="rgba(245, 239, 224, 0.12)" strokeWidth={1.6} />
              </View>
            </>
          )}
          <View style={[styles.shade, { height: 170, opacity: 0.25 }]} />
          <View style={[styles.shade, { height: 120, opacity: 0.35 }]} />
          <View style={[styles.shade, { height: 70, opacity: 0.45 }]} />
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to map" style={[styles.back, { top: insets.top + 8 }]}>
            <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroText}>
            <View style={styles.badges}>
              <Text style={[styles.badge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.label.toUpperCase()}</Text>
              <Text style={[styles.badge, styles.fixedBadge]}>STAYS PUT</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit>{waypoint.name.toUpperCase()}</Text>
            {waypoint.note && <Text style={styles.note}>{waypoint.note}</Text>}
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

          <View style={styles.manage}>
            <AppButton variant="ghost" title="Edit" onPress={() => setEditing(true)} style={styles.flex} />
            <AppButton variant="ghost" title={moving ? 'Getting a fix…' : 'Move'} onPress={chooseMove} disabled={moving} style={styles.flex} />
            {isOwner && <AppButton variant="ghost" title="Delete" onPress={confirmDelete} style={styles.flex} />}
          </View>

          <View style={styles.subheadingRow}>
            <Text style={styles.subheading} accessibilityRole="header">HISTORY</Text>
            <View style={styles.rule} />
          </View>
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

      <PlaceSheet
        visible={editing}
        title="Edit place"
        initial={{ kind: waypoint.kind, name: waypoint.name, note: waypoint.note }}
        onSave={async (fields) => {
          await updateWaypoint(waypoint.id, fields);
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    </View>
  );
}

function StatusTag({ status }: { status: Observation['status'] }) {
  if (status === 'open') return <Stamp label="Open" tone="open" />;
  if (status === 'resolved') return <Stamp label="Fixed" tone="done" tilt={3} />;
  return <Stamp label={STATUS_LABEL[status]} tone="clear" tilt={2} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  hero: { backgroundColor: colors.chrome, justifyContent: 'flex-end' },
  heroIcon: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.pine },
  back: {
    position: 'absolute', left: 12, width: touch.round, height: touch.round, borderRadius: touch.round / 2,
    backgroundColor: 'rgba(16, 23, 19, 0.75)', alignItems: 'center', justifyContent: 'center',
  },
  heroText: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 6 },
  badges: { flexDirection: 'row', gap: space.sm },
  badge: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.6, borderRadius: 4, overflow: 'hidden', paddingVertical: 2, paddingHorizontal: 8 },
  fixedBadge: { backgroundColor: palette.canvas, color: palette.pine },
  title: { fontFamily: fonts.displayBlack, fontSize: 64, lineHeight: 60, color: palette.white, includeFontPadding: false },
  note: { fontSize: 15, color: palette.canvas },
  manage: { flexDirection: 'row', gap: space.sm },
  body: { padding: space.lg, gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  cardDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline, paddingVertical: 12 },
  cardTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted },
  statusDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: palette.white },
  subheadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  subheading: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2.4, color: colors.textMuted },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  historyRow: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.surface, borderRadius: 14, borderBottomWidth: 2, borderBottomColor: colors.hairline,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  historyTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 23, color: colors.text },
  actions: {
    paddingTop: 12, paddingHorizontal: space.lg, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.hairline,
  },
});

