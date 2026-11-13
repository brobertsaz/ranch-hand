import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import MiniMap from '../components/MiniMap';
import { claimObservation, observationsOfTag, onDatabaseChange, photosFor, setObservationStatus, type Observation, type ObservationStatus } from '../db';
import { bearingDegrees, compassPoint, dayAndTime, distanceMeters, clockParts, formatDistance, relativeTo, timeAgo, type LngLat } from '../format';
import { KIND_INFO, STATUS_LABEL, splitNote } from '../kinds';
import { useMemberNames, who } from '../members';
import { onPhotoArrived, photoFile } from '../photoFiles';
import { colors, fonts, palette, space, sync, touch } from '../theme';
import EditObservationScreen from './EditObservationScreen';
import GuideScreen, { guideToObservation } from './GuideScreen';
import TagHistoryScreen from './TagHistoryScreen';

type Props = {
  observation: Observation;
  // The place this check was made at, if any
  placeName?: string | null;
  memberId: string;
  mapStyle: string;
  here: LngLat | null;
  // Brings down a photo that syncs leave on the server (an old, settled observation). False when it can't right now.
  fetchPhoto: (photoId: string) => Promise<boolean>;
  // The hand who logged it, or the owner: the only ones who can delete it
  canDelete: boolean;
  // Another sighting of the same tag, picked from its history
  onOpenObservation: (id: string) => void;
  onBack: () => void;
  // After a local edit, so it can sync straight away when there's signal
  onChanged: () => void;
};

// Mockup 4 · Observation
export default function ObservationScreen({ observation, placeName = null, memberId, mapStyle, here, fetchPhoto, canDelete, onOpenObservation, onBack, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  // undefined: no photo was taken; null: there is one, but it hasn't downloaded to this phone yet
  const [photoUri, setPhotoUri] = useState<string | null | undefined>(undefined);
  // Why there's no photo on screen yet: it's on its way from the server, the server couldn't be reached,
  // or the phone that took it hasn't sent it up
  const [photoWait, setPhotoWait] = useState<'fetching' | 'unreachable' | 'not-sent'>('not-sent');
  const [guiding, setGuiding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showingTag, setShowingTag] = useState(false);
  // How many times this tag has been logged, this pin included
  const [sightings, setSightings] = useState(0);
  const info = KIND_INFO[observation.kind];
  const lngLat: LngLat = [observation.longitude, observation.latitude];
  const names = useMemberNames();
  const author = who(names, observation.member_id, memberId);
  const synced = observation._status === 'synced';
  const rejected = observation._status === 'rejected';
  const accuracy = `±${Math.round(observation.accuracy ?? 0)} m`;
  const { picks, extra } = splitNote(observation.kind, observation.note);
  const meters = here ? distanceMeters(here, lngLat) : null;

  useEffect(() => {
    let gone = false;
    // One try per visit: a fetch that failed for want of signal would fail again on every reload
    let asked = false;
    const load = () =>
      photosFor(observation.id).then((photos) => {
        if (gone) return;
        if (photos.length === 0) return setPhotoUri(undefined);
        const file = photos.map((p) => photoFile(p.id)).find((f) => f.exists);
        setPhotoUri(file?.uri ?? null);
        if (file) return;
        // On the server but not here: syncs only bring down what's open or recent, so ask for this one
        const onServer = photos.find((p) => p.uploaded_at !== null && p._status === 'synced');
        if (!onServer) return setPhotoWait('not-sent');
        if (asked) return;
        asked = true;
        setPhotoWait('fetching');
        // When it lands, onPhotoArrived reloads and the photo shows
        fetchPhoto(onServer.id).then((ok) => !gone && !ok && setPhotoWait('unreachable'));
      });
    load();
    // "Photo arrives on the next sync" has to come true while the screen is open: the photo's row can land,
    // and later its file, which changes no row
    const sub = onDatabaseChange(['photos'], load);
    const arrivals = onPhotoArrived(load);
    return () => {
      gone = true;
      sub.remove();
      arrivals.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPhoto is a new function on every render of the map
  }, [observation.id]);

  const tag = observation.tag_number;
  useEffect(() => {
    if (!tag) return;
    const load = () => observationsOfTag(tag).then((all) => setSightings(all.length));
    load();
    const sub = onDatabaseChange(['observations'], load);
    return () => sub.remove();
  }, [tag]);

  // "I've got it", letting it go (null), or taking it over from another hand
  async function claim(by: string | null) {
    try {
      await claimObservation(observation.id, by);
    } catch {
      return Alert.alert("Couldn't save that", 'The phone had trouble saving. Try again.');
    }
    onChanged();
  }

  async function changeStatus(status: ObservationStatus) {
    try {
      await setObservationStatus(observation.id, status, memberId);
    } catch {
      return Alert.alert("Couldn't save that", 'The phone had trouble saving. Try again.');
    }
    onChanged();
  }

  if (guiding) return <GuideScreen target={guideToObservation(observation)} onBack={() => setGuiding(false)} />;
  if (editing) {
    return (
      <EditObservationScreen
        observation={observation}
        canDelete={canDelete}
        onDone={(outcome) => {
          setEditing(false);
          if (outcome === 'cancelled') return;
          onChanged();
          // The pin is gone, so there's nothing left here to show
          if (outcome === 'deleted') onBack();
        }}
      />
    );
  }
  if (showingTag && tag) {
    return (
      <TagHistoryScreen
        tag={tag}
        memberId={memberId}
        currentId={observation.id}
        onBack={() => setShowingTag(false)}
        onOpen={(sighting) => {
          setShowingTag(false);
          if (sighting.id !== observation.id) onOpenObservation(sighting.id);
        }}
      />
    );
  }

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
              <Text style={styles.noPhotoText}>
                {photoUri === undefined
                  ? 'No photo'
                  : photoWait === 'fetching'
                    ? 'Getting the photo…'
                    : photoWait === 'unreachable'
                      ? "The photo isn't on this phone. It needs a signal to fetch."
                      : 'Photo arrives on the next sync'}
              </Text>
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
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel="Fix this pin"
            style={[styles.back, styles.edit, { top: insets.top + 8 }]}
          >
            <Icon name="edit" size={20} color={colors.chromeText} strokeWidth={2.2} />
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

          {tag && (
            <Pressable onPress={() => setShowingTag(true)} accessibilityRole="button" style={({ pressed }) => [styles.card, styles.cardRow, pressed && styles.pressed]}>
              <Icon name="history" size={22} color={colors.text} strokeWidth={2.2} />
              <View style={styles.where}>
                <Text style={styles.cardTitle}>Tag {tag} history</Text>
                <Text style={styles.cardMeta}>{sightings > 1 ? `Logged ${sightings} times on this ranch` : 'This is the only time it’s been logged'}</Text>
              </View>
              <Icon name="chevronRight" size={20} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          )}
          {observation.status === 'open' && (
            // So two hands don't both ride out to the same heifer
            <View style={[styles.card, styles.claim]}>
              <View style={styles.where}>
                <Text style={styles.cardTitle}>
                  {!observation.claimed_by_id
                    ? 'Nobody has this yet'
                    : observation.claimed_by_id === memberId
                      ? "You've got this"
                      : `${who(names, observation.claimed_by_id, memberId)} has this`}
                </Text>
                <Text style={styles.cardMeta}>
                  {observation.claimed_by_id && observation.claimed_at ? `Since ${timeAgo(observation.claimed_at)}` : "Say so, and the crew won't send two."}
                </Text>
              </View>
              {!observation.claimed_by_id ? (
                <AppButton title="I've got it" onPress={() => claim(memberId)} />
              ) : observation.claimed_by_id === memberId ? (
                <AppButton variant="ghost" title="Let it go" onPress={() => claim(null)} />
              ) : (
                <AppButton variant="ghost" title="Take over" onPress={() => claim(memberId)} />
              )}
            </View>
          )}
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
            <View style={[styles.dot, { backgroundColor: synced ? sync.synced : rejected ? sync.failed : sync.pending }]} />
            <Text style={styles.syncText}>
              {synced ? 'Synced to the crew' : rejected ? "Only on this phone. The server didn't take it; Settings says why." : "Saved on this phone. Sends when you're back in range."}
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
  edit: { left: undefined, right: 12 },
  pressed: { opacity: 0.7 },
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
  claim: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
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
