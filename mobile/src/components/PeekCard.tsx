import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Observation, Waypoint } from '../db';
import { relativeTo, timeAgo, type LngLat } from '../format';
import { KIND_INFO, WAYPOINT_INFO } from '../kinds';
import { colors, fonts, shadow, space } from '../theme';
import Icon from './Icon';

// 72 photo + 2 × 10 padding
export const PEEK_HEIGHT = 92;

// claimedBy: "Sam" or "You", when someone has said they've got it
type PeekProps = { observation: Observation; photoUri: string | null; author: string; claimedBy: string | null; here: LngLat | null; bottom: number; onPress: () => void };

// The card that comes up from the bottom of the map when a pin is tapped
export function PeekCard({ observation, photoUri, author, claimedBy, here, bottom, onPress }: PeekProps) {
  const info = KIND_INFO[observation.kind];
  const title = [observation.tag_number && `Tag ${observation.tag_number}`, observation.note].filter(Boolean).join(' · ') || info.label;
  const where = here ? relativeTo(here, [observation.longitude, observation.latitude]) : `±${Math.round(observation.accuracy ?? 0)} m`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens the observation" style={[styles.peek, { bottom }]}>
      <View style={styles.peekPhoto}>
        {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} /> : <Icon name={info.icon} size={28} color={colors.chromeTextMuted} />}
      </View>
      <View style={styles.peekText}>
        <View style={styles.peekMeta}>
          <Text style={[styles.peekBadge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.short.toUpperCase()}</Text>
          <Text style={styles.peekSmall}>
            {timeAgo(observation.observed_at)} · {author}
          </Text>
        </View>
        <Text style={styles.peekTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.peekSmall} numberOfLines={1}>
          {claimedBy ? `${claimedBy === 'You' ? "You've" : `${claimedBy} has`} got it · ` : ''}
          {where}
          {observation._status !== 'synced' ? ' · on this phone' : ''}
        </Text>
      </View>
      <Icon name="chevronRight" size={22} color={colors.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

type PlacePeekProps = {
  waypoint: Waypoint;
  latest: Observation | null;
  photoUri: string | null;
  author: string;
  here: LngLat | null;
  bottom: number;
  onPress: () => void;
};

export function PlacePeekCard({ waypoint, latest, photoUri, author, here, bottom, onPress }: PlacePeekProps) {
  const info = WAYPOINT_INFO[waypoint.kind];
  const where = here ? relativeTo(here, [waypoint.longitude, waypoint.latitude]) : 'Fixed place';
  const status = latest
    ? [latest.note ?? 'Checked', latest.status === 'resolved' && 'resolved', timeAgo(latest.observed_at), author]
        .filter(Boolean)
        .join(' · ')
    : 'No checks yet';

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens the place" style={[styles.peek, { bottom }]}>
      <View style={[styles.peekPhoto, styles.peekPlace]}>
        {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} /> : <Icon name={info.icon} size={28} color={colors.chromeTextMuted} />}
      </View>
      <View style={styles.peekText}>
        <View style={styles.peekMeta}>
          <Text style={[styles.peekBadge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.label.toUpperCase()}</Text>
          <Text style={styles.peekSmall}>{where}</Text>
        </View>
        <Text style={styles.peekTitle} numberOfLines={1}>{waypoint.name}</Text>
        <Text style={styles.peekSmall} numberOfLines={1}>{status}</Text>
      </View>
      <Icon name="chevronRight" size={22} color={colors.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  peek: {
    ...shadow, position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  peekPhoto: {
    width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.chromeRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  // Square, like the place's pin
  peekPlace: { borderRadius: 6 },
  peekText: { flex: 1, gap: 3, minWidth: 0 },
  peekMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  peekBadge: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, borderRadius: 4, overflow: 'hidden', paddingVertical: 2, paddingHorizontal: 7 },
  peekTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 25, color: colors.text },
  peekSmall: { fontSize: 13, color: colors.textMuted },
});
