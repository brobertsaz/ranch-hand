import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import MiniMap from '../components/MiniMap';
import { photosFor, type Observation } from '../db';
import { dayAndTime, relativeTo, timeAgo, type LngLat } from '../format';
import { KIND_INFO } from '../kinds';
import { photoFile } from '../photoFiles';
import { colors, fonts, palette, space, sync } from '../theme';
import GuideScreen, { guideToObservation } from './GuideScreen';

type Props = {
  observation: Observation;
  // The place this check was made at, if any
  placeName?: string | null;
  memberId: string;
  mapStyle: string;
  here: LngLat | null;
  onBack: () => void;
};

// Mockup 4 · Observation
export default function ObservationScreen({ observation, placeName = null, memberId, mapStyle, here, onBack }: Props) {
  const insets = useSafeAreaInsets();
  // undefined: no photo was taken; null: there is one, but it hasn't downloaded to this phone yet
  const [photoUri, setPhotoUri] = useState<string | null | undefined>(undefined);
  const [guiding, setGuiding] = useState(false);
  const info = KIND_INFO[observation.kind];
  const lngLat: LngLat = [observation.longitude, observation.latitude];
  const mine = observation.member_id === memberId;
  const synced = observation._status === 'synced';
  const accuracy = `±${Math.round(observation.accuracy ?? 0)} m`;

  useEffect(() => {
    photosFor(observation.id).then((photos) => {
      if (photos.length === 0) return setPhotoUri(undefined);
      const file = photos.map((p) => photoFile(p.id)).find((f) => f.exists);
      setPhotoUri(file?.uri ?? null);
    });
  }, [observation.id]);

  if (guiding) return <GuideScreen target={guideToObservation(observation)} onBack={() => setGuiding(false)} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
        <View style={[styles.hero, { height: 300 + insets.top }]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo of ${info.label.toLowerCase()}`} />
          ) : (
            <View style={styles.noPhoto}>
              <Icon name="camera" size={32} color={colors.chromeTextMuted} />
              <Text style={styles.noPhotoText}>{photoUri === null ? 'Photo arrives on the next sync' : 'No photo'}</Text>
            </View>
          )}
          <View style={styles.heroShade} />
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
              <Text style={[styles.badge, styles.statusBadge]}>{observation.status === 'resolved' ? 'RESOLVED' : 'OPEN'}</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {observation.tag_number ? `Tag ${observation.tag_number}` : info.label}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {observation.note ? <Text style={styles.note}>“{observation.note}”</Text> : null}

          <View style={styles.card}>
            <View style={[styles.cardRow, styles.cardDivider]}>
              <View style={styles.avatar}>
                <Icon name="crew" size={18} color={palette.white} />
              </View>
              <View>
                {/* Member names don't sync yet, so other hands show generically */}
                <Text style={styles.cardTitle}>{mine ? 'You' : 'Another hand'}</Text>
                <Text style={styles.cardMeta}>
                  {dayAndTime(observation.observed_at)} · {timeAgo(observation.observed_at)}
                </Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              <MiniMap mapStyle={mapStyle} lngLat={lngLat} color={info.pinColor} />
              <View style={styles.where}>
                <Text style={styles.cardTitle}>{placeName ? `At ${placeName}` : here ? relativeTo(here, lngLat) : 'Where it was logged'}</Text>
                <Text style={styles.cardMeta}>
                  {placeName && here ? `${relativeTo(here, lngLat)} · ` : ''}
                  {accuracy} accuracy
                </Text>
              </View>
            </View>
          </View>

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
        <AppButton
          title="Mark resolved"
          style={styles.resolve}
          icon={<Icon name="check" size={22} color={palette.white} strokeWidth={2.8} />}
          onPress={() => Alert.alert('Not built yet', 'Resolving observations is the next Phase 2 item.')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.chrome, justifyContent: 'flex-end' },
  noPhoto: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noPhotoText: { color: colors.chromeTextMuted, fontSize: 15, fontWeight: '600' },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, backgroundColor: 'rgba(10, 16, 12, 0.55)' },
  back: {
    position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(16, 23, 19, 0.75)', alignItems: 'center', justifyContent: 'center',
  },
  heroText: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 6 },
  badges: { flexDirection: 'row', gap: space.sm },
  badge: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, borderRadius: 4, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 8 },
  statusBadge: { backgroundColor: palette.canvas, color: palette.pine },
  title: { fontFamily: fonts.displayBlack, fontSize: 44, lineHeight: 44, color: palette.white },
  body: { padding: space.lg, gap: 14 },
  note: { fontSize: 18, lineHeight: 25, color: colors.text },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  cardDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(23, 27, 24, 0.1)', paddingVertical: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted },
  where: { flex: 1, gap: 2 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  syncText: { flex: 1, fontSize: 14, color: '#4F554F' },
  actions: {
    flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: space.lg,
    borderTopWidth: 1, borderTopColor: 'rgba(23, 27, 24, 0.12)', backgroundColor: colors.background,
  },
  takeMeThere: { flex: 1, minHeight: 60, borderRadius: 12 },
  resolve: { flex: 1.3, minHeight: 60, borderRadius: 12 },
});
