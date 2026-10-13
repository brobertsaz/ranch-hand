import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import MiniMap from '../components/MiniMap';
import { photosFor, setObservationStatus, type Observation, type ObservationStatus } from '../db';
import { bearingDegrees, compassPoint, dayAndTime, distanceMeters, clockParts, formatDistance, relativeTo, timeAgo, type LngLat } from '../format';
import { KIND_INFO, STATUS_LABEL, splitNote } from '../kinds';
import { useMemberNames, who } from '../members';
import { photoFile } from '../photoFiles';
import { colors, fonts, palette, space, sync, touch } from '../theme';
import GuideScreen, { guideToObservation } from './GuideScreen';

type Props = {
  observation: Observation;
  // The place this check was made at, if any
  placeName?: string | null;
  memberId: string;
  mapStyle: string;
  here: LngLat | null;
  onBack: () => void;
  // After a local edit, so it can sync straight away when there's signal
  onChanged: () => void;
};

// Mockup 4 · Observation
export default function ObservationScreen({ observation, placeName = null, memberId, mapStyle, here, onBack, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  // undefined: no photo was taken; null: there is one, but it hasn't downloaded to this phone yet
  const [photoUri, setPhotoUri] = useState<string | null | undefined>(undefined);
  const [guiding, setGuiding] = useState(false);
  const info = KIND_INFO[observation.kind];
  const lngLat: LngLat = [observation.longitude, observation.latitude];
  const names = useMemberNames();
  const author = who(names, observation.member_id, memberId);
  const synced = observation._status === 'synced';
  const accuracy = `±${Math.round(observation.accuracy ?? 0)} m`;
  const { picks, extra } = splitNote(observation.kind, observation.note);
  const meters = here ? distanceMeters(here, lngLat) : null;

  useEffect(() => {
    photosFor(observation.id).then((photos) => {
      if (photos.length === 0) return setPhotoUri(undefined);
      const file = photos.map((p) => photoFile(p.id)).find((f) => f.exists);
      setPhotoUri(file?.uri ?? null);
    });
  }, [observation.id]);

  async function changeStatus(status: ObservationStatus) {
    await setObservationStatus(observation.id, status, memberId);
    onChanged();
  }

  if (guiding) return <GuideScreen target={guideToObservation(observation)} onBack={() => setGuiding(false)} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
        <View style={[styles.hero, { height: 330 + insets.top }]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo of ${info.label.toLowerCase()}`} />
          ) : (
            <View style={styles.noPhoto}>
              <Icon name="camera" size={32} color={colors.chromeTextMuted} />
              <Text style={styles.noPhotoText}>{photoUri === null ? 'Photo arrives on the next sync' : 'No photo'}</Text>
            </View>
          )}
          {/* A stepped fade, so the big title reads on any photo */}
          <View style={[styles.shade, { height: 190, opacity: 0.25 }]} />
          <View style={[styles.shade, { height: 140, opacity: 0.35 }]} />
          <View style={[styles.shade, { height: 90, opacity: 0.45 }]} />
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to map"
            style={[styles.back, { top: insets.top + 8 }]}
          >
            <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroText}>
            <View style={styles.badges}>
              <Text style={[styles.badge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.badge}</Text>
              <Text style={styles.statusStamp}>{STATUS_LABEL[observation.status]}</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit>
              {(observation.tag_number ? `Tag ${observation.tag_number}` : placeName ?? info.label).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {picks.length > 0 && (
            <View style={styles.picks}>
              {picks.map((pick) => (
                <Text key={pick} style={styles.pick}>{pick.toUpperCase()}</Text>
              ))}
            </View>
          )}
          {extra ? <Text style={styles.note}>“{extra}”</Text> : null}

          {/* The three numbers a hand needs before riding out, big enough to read at arm's length */}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{meters === null ? '—' : meters < 30 ? 'Here' : formatDistance(meters)}</Text>
              <Text style={styles.statLabel}>{meters !== null && meters >= 30 && here ? compassPoint(bearingDegrees(here, lngLat)) : 'DISTANCE'}</Text>
            </View>
            <View style={[styles.stat, styles.statDivider]}>
              <Text style={styles.statValue}>{clockParts(observation.observed_at).time}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>BY {author.toUpperCase()}</Text>
            </View>
            <View style={[styles.stat, styles.statDivider]}>
              <Text style={styles.statValue}>{accuracy}</Text>
              <Text style={styles.statLabel}>GPS</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <MiniMap mapStyle={mapStyle} lngLat={lngLat} color={info.pinColor} />
              <View style={styles.where}>
                <Text style={styles.cardTitle}>{placeName ? `At ${placeName}` : here ? relativeTo(here, lngLat) : 'Where it was logged'}</Text>
                <Text style={styles.cardMeta}>
                  {dayAndTime(observation.observed_at)} · {timeAgo(observation.observed_at)}
                </Text>
              </View>
            </View>
          </View>

          {observation.status === 'resolved' && (
            <View style={styles.syncRow}>
              <Icon name="check" size={16} color={sync.synced} strokeWidth={3} />
              <Text style={styles.resolvedText}>
                Resolved by {who(names, observation.resolved_by_id, memberId)}
                {observation.resolved_at ? ` · ${timeAgo(observation.resolved_at)}` : ''}
              </Text>
            </View>
          )}

          <View style={styles.syncRow}>
            <View style={[styles.dot, { backgroundColor: synced ? sync.synced : sync.pending }]} />
            <Text style={styles.syncText}>
              {synced ? 'Synced to the crew' : "Saved on this phone. Sends when you're back in range."}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        <AppButton
          variant="secondary"
          title="Take me there"
          style={styles.takeMeThere}
          icon={<Icon name="navigate" size={22} color={palette.white} strokeWidth={2.2} />}
          onPress={() => setGuiding(true)}
        />
        {observation.status === 'open' && (
          // One tap, no dialog: with gloves on a confirm is just another target to miss. Reopen undoes it.
          <AppButton
            title="Mark resolved"
            style={styles.resolve}
            icon={<Icon name="check" size={22} color={palette.white} strokeWidth={2.8} />}
            onPress={() => changeStatus('resolved')}
          />
        )}
        {observation.status === 'resolved' && <AppButton variant="ghost" title="Reopen" style={styles.resolve} onPress={() => changeStatus('open')} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.chrome, justifyContent: 'flex-end' },
  noPhoto: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noPhotoText: { color: colors.chromeTextMuted, fontSize: 15, fontWeight: '600' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.pine },
  back: {
    position: 'absolute', left: 12, width: touch.round, height: touch.round, borderRadius: touch.round / 2,
    backgroundColor: 'rgba(16, 23, 19, 0.75)', alignItems: 'center', justifyContent: 'center',
  },
  heroText: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 6 },
  badges: { flexDirection: 'row', gap: space.sm },
  badge: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.6, borderRadius: 4, overflow: 'hidden', paddingVertical: 2, paddingHorizontal: 8 },
  statusStamp: {
    fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.6, color: palette.canvas, borderWidth: 2, borderColor: palette.canvas,
    borderRadius: 4, paddingHorizontal: 7, transform: [{ rotate: '-3deg' }],
  },
  title: { fontFamily: fonts.displayBlack, fontSize: 68, lineHeight: 64, color: palette.white, includeFontPadding: false },
  body: { padding: space.lg, gap: 16 },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pick: {
    fontFamily: fonts.display, fontSize: 20, color: palette.canvas, backgroundColor: colors.chromeRaised, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, overflow: 'hidden', paddingVertical: 6, paddingHorizontal: 16,
  },
  note: { fontSize: 18, lineHeight: 25, color: colors.text },
  stats: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border },
  stat: { flex: 1, paddingVertical: 10, gap: 2 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 12 },
  statValue: { fontFamily: fonts.displayBlack, fontSize: 30, lineHeight: 32, color: colors.text },
  statLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  resolvedText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted },
  where: { flex: 1, gap: 2 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  syncText: { flex: 1, fontSize: 14, color: colors.textMuted },
  actions: {
    flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: space.lg,
    borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.background,
  },
  takeMeThere: { flex: 1.2, minHeight: 68, borderRadius: 14 },
  resolve: { flex: 1, minHeight: 68, borderRadius: 14 },
});
