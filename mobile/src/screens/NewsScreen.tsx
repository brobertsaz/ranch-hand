import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { useTabBarHeight } from '../components/TabBar';
import { getState } from '../db';
import { timeAgo } from '../format';
import { useMemberNames, who } from '../members';
import { crewNews, dayLabel, isNew, markNewsSeen, newsSeenAt, type NewsItem } from '../news';
import { colors, fonts, palette, space, touch } from '../theme';
import type { SyncState } from '../useSync';

type Props = {
  memberId: string;
  sync: SyncState & { syncNow: () => void };
  onOpenObservation: (id: string) => void;
  onShowRide: (id: string) => void;
};

// Mockup 5 · What's new: what the crew did, grouped by day, with your own unsent work up top
export default function NewsScreen({ memberId, sync, onOpenObservation, onShowRide }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const names = useMemberNames();
  const [items, setItems] = useState<NewsItem[]>([]);
  // Captured on open so this visit still shows what was new, while the tab badge clears
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);

  const reload = useCallback(() => {
    crewNews(memberId).then(setItems);
    getState('last_pulled_at').then((value) => setLastSync(value ? Number(value) : null));
  }, [memberId]);

  useEffect(() => {
    newsSeenAt().then((at) => {
      setSeenAt(at);
      markNewsSeen();
    });
    reload();
    const sub = addDatabaseChangeListener(reload);
    return () => sub.remove();
  }, [reload]);

  const newCount = seenAt === null ? 0 : items.filter((item) => isNew(item, seenAt)).length;
  const waiting = sync.pending.records;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text style={styles.title} accessibilityRole="header">What's new</Text>
        <View style={styles.headerRow}>
          <Text style={styles.headerMeta}>
            {newCount} since you last looked{lastSync ? ` · synced ${timeAgo(lastSync)}` : ''}
          </Text>
          <Pressable onPress={sync.syncNow} disabled={sync.syncing} accessibilityRole="button" style={styles.syncButton}>
            <Text style={styles.syncButtonText}>{sync.syncing ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + space.xl }]}>
        {waiting > 0 && (
          <View style={styles.waiting}>
            <Icon name="cloudOff" size={24} color="#C98A22" strokeWidth={2.2} />
            <View style={styles.flex}>
              <Text style={styles.waitingTitle}>
                {waiting} of yours waiting for signal
              </Text>
              <Text style={styles.waitingDetail}>
                {sync.pending.uploads > 0 ? `${sync.pending.uploads} photo${sync.pending.uploads === 1 ? '' : 's'} included · ` : ''}safe on this phone
              </Text>
            </View>
          </View>
        )}

        {items.length === 0 && <Text style={styles.empty}>Nothing from the crew yet. When another hand logs something, it shows up here after a sync.</Text>}

        {items.map((item, index) => {
          const day = dayLabel(item.at);
          const fresh = seenAt !== null && isNew(item, seenAt);
          return (
            <Fragment key={item.key}>
              {(index === 0 || dayLabel(items[index - 1].at) !== day) && <Text style={styles.day}>{day}</Text>}
              <Pressable
                onPress={() => (item.rideId ? onShowRide(item.rideId) : item.observationId && onOpenObservation(item.observationId))}
                accessibilityRole="button"
                style={[styles.row, fresh && styles.rowNew]}
              >
                <View style={[styles.badge, { backgroundColor: item.color }]}>
                  <Icon name={item.icon} size={22} color={palette.white} strokeWidth={2.4} />
                </View>
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.rowTitle, item.status === 'resolved' && styles.rowTitleDone]} numberOfLines={2}>{item.title}</Text>
                    {item.status === 'open' && <Text style={[styles.tag, styles.tagOpen]}>OPEN</Text>}
                    {item.status === 'resolved' && <Text style={[styles.tag, styles.tagDone]}>RESOLVED</Text>}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[who(names, item.memberId, memberId), item.detail, new Date(item.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {fresh && <View style={styles.newDot} accessibilityLabel="New" />}
              </Pressable>
            </Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  header: { backgroundColor: colors.chrome, paddingHorizontal: space.lg, paddingBottom: 18, gap: 6 },
  title: { fontFamily: fonts.displayBlack, fontSize: 44, lineHeight: 44, color: colors.chromeText },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  headerMeta: { flex: 1, fontSize: 14, color: colors.chromeTextMuted },
  syncButton: { minHeight: touch.round, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(245, 239, 224, 0.3)', justifyContent: 'center' },
  syncButtonText: { color: colors.chromeText, fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: 12, paddingTop: 14, gap: 10 },
  waiting: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#C98A22', backgroundColor: '#FBEFD6', borderRadius: 12,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  waitingTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  waitingDetail: { fontSize: 13, color: '#5E4A26' },
  empty: { fontSize: 15, lineHeight: 21, color: colors.textMuted, paddingHorizontal: 4, paddingTop: space.sm },
  day: { marginTop: 6, marginHorizontal: 4, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.textMuted },
  row: {
    minHeight: 72, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(23, 27, 24, 0.14)', borderRadius: 12,
    padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  rowNew: { borderColor: palette.trailDark, borderWidth: 2 },
  badge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flexShrink: 1, fontFamily: fonts.display, fontSize: 21, lineHeight: 22, color: colors.text },
  rowTitleDone: { color: colors.textMuted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tag: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, borderRadius: 4, overflow: 'hidden', paddingVertical: 2, paddingHorizontal: 6 },
  tagOpen: { color: palette.white, backgroundColor: palette.trailDark },
  // Darker than the synced green so small white text clears 4.5:1
  tagDone: { color: palette.white, backgroundColor: '#3B6E4A' },
  rowMeta: { fontSize: 13, color: colors.textMuted },
  newDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.trail },
});
