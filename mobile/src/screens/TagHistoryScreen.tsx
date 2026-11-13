import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { observationsOfTag, onDatabaseChange, type Observation } from '../db';
import { dayAndTime, timeAgo } from '../format';
import { KIND_INFO, STATUS_LABEL, splitNote } from '../kinds';
import { useMemberNames, who } from '../members';
import { colors, fonts, palette, space, sync, touch } from '../theme';

// "Fri 4:45 PM" this week; further back the weekday alone could be any week, so "Oct 24 · 5:45 PM"
function sightingDate(ms: number, now = Date.now()): string {
  if (now - ms < 6 * 86_400_000) return dayAndTime(ms);
  const date = new Date(ms);
  const year = date.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric';
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

type Props = {
  tag: string;
  memberId: string;
  // The pin this was opened from, marked in the list
  currentId?: string | null;
  onBack: () => void;
  onOpen: (observation: Observation) => void;
};

// Every time this ear tag was logged on the ranch, newest first: what was wrong, who saw it, how it ended
export default function TagHistoryScreen({ tag, memberId, currentId = null, onBack, onOpen }: Props) {
  const insets = useSafeAreaInsets();
  const names = useMemberNames();
  const [sightings, setSightings] = useState<Observation[] | null>(null);

  useEffect(() => {
    const load = () => observationsOfTag(tag).then(setSightings);
    load();
    const sub = onDatabaseChange(['observations'], load);
    return () => sub.remove();
  }, [tag]);

  const open = sightings?.filter((o) => o.status === 'open').length ?? 0;
  const first = sightings?.at(-1);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.eyebrow}>TAG HISTORY</Text>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          TAG {tag.toUpperCase()}
        </Text>
        {sightings && sightings.length > 0 && first && (
          <Text style={styles.summary}>
            Logged {sightings.length === 1 ? 'once' : `${sightings.length} times`} · first {timeAgo(first.observed_at)}
            {open > 0 ? ` · ${open} still open` : ''}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.lg, gap: 10 }}>
        {sightings?.length === 0 && <Text style={styles.empty}>Nothing logged for this tag on this phone.</Text>}
        {sightings?.map((sighting) => {
          const { picks, extra } = splitNote(sighting.kind, sighting.note);
          const here = sighting.id === currentId;
          return (
            <Pressable
              key={sighting.id}
              onPress={() => onOpen(sighting)}
              accessibilityRole="button"
              accessibilityLabel={`${sightingDate(sighting.observed_at)}, ${STATUS_LABEL[sighting.status].toLowerCase()}`}
              style={({ pressed }) => [styles.row, here && styles.rowHere, pressed && styles.rowPressed]}
            >
              <View style={styles.rowText}>
                <View style={styles.rowTop}>
                  <Text style={styles.when}>{sightingDate(sighting.observed_at)}</Text>
                  <Text style={[styles.status, sighting.status === 'open' && styles.statusOpen]}>{STATUS_LABEL[sighting.status]}</Text>
                </View>
                <Text style={styles.what} numberOfLines={2}>
                  {picks.length > 0 ? picks.join(', ') : extra ?? KIND_INFO[sighting.kind].label}
                </Text>
                {picks.length > 0 && extra ? <Text style={styles.note} numberOfLines={2}>“{extra}”</Text> : null}
                <Text style={styles.meta}>
                  {who(names, sighting.member_id, memberId)} · {timeAgo(sighting.observed_at)}
                  {sighting.status === 'resolved' ? ` · resolved by ${sighting.resolved_by_id === memberId ? 'you' : who(names, sighting.resolved_by_id, memberId)}` : ''}
                  {here ? ' · this pin' : ''}
                </Text>
              </View>
              <Icon name="chevronRight" size={20} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.chrome, paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 4 },
  back: {
    width: touch.round, height: touch.round, borderRadius: touch.round / 2, marginLeft: -4, marginBottom: 8,
    backgroundColor: colors.chromeRaised, alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.6, color: colors.chromeTextMuted },
  title: { fontFamily: fonts.displayBlack, fontSize: 56, lineHeight: 56, color: palette.white, includeFontPadding: false },
  summary: { fontSize: 15, fontWeight: '600', color: colors.chromeTextMuted },
  empty: { fontSize: 16, color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, minHeight: touch.min,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  rowHere: { borderWidth: 2, borderColor: colors.text },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  when: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
  status: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 1.2, color: colors.textMuted },
  statusOpen: { color: sync.failed },
  what: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: colors.text },
  note: { fontSize: 15, lineHeight: 20, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
