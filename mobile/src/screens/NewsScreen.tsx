import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import FieldHeader from '../components/FieldHeader';
import Icon from '../components/Icon';
import Stamp from '../components/Stamp';
import { useTabBarHeight } from '../components/TabBar';
import { getState } from '../db';
import { timeAgo } from '../format';
import { useMemberNames, who } from '../members';
import { crewNews, dayLabel, isNew, markNewsSeen, newsSeenAt, type NewsItem } from '../news';
import { colors, fonts, palette, space, touch } from '../theme';
import type { SyncState } from '../useSync';

type Props = {
  memberId: string;
  ranchName: string;
  sync: SyncState & { syncNow: () => void };
  onOpenObservation: (id: string) => void;
  onShowRide: (id: string) => void;
};

// Mockup 5 · What's new: what the crew did, grouped by day, with your own unsent work up top
export default function NewsScreen({ memberId, ranchName, sync, onOpenObservation, onShowRide }: Props) {
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
  const openCount = items.filter((item) => item.status === 'open').length;
  const today = dayLabel(Date.now());
  const fixedToday = items.filter((item) => item.status === 'resolved' && dayLabel(item.at) === today).length;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FieldHeader
        eyebrow={`${ranchName} · ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`.toUpperCase()}
        title="What's new"
        right={
          <Pressable onPress={sync.syncNow} disabled={sync.syncing} accessibilityRole="button" accessibilityLabel={sync.syncing ? 'Syncing' : 'Sync now'} style={styles.syncButton}>
            <Icon name="refresh" size={20} color={colors.chromeText} strokeWidth={2.2} />
            <Text style={styles.syncButtonText}>{sync.syncing ? 'Syncing…' : lastSync ? timeAgo(lastSync) : 'Sync'}</Text>
          </Pressable>
        }
        stats={[
          { value: String(newCount), label: 'New' },
          { value: String(openCount), label: 'Open', alert: openCount > 0 },
          { value: String(fixedToday), label: 'Fixed today' },
        ]}
      />

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + space.xl }]}>
        {waiting > 0 && (
          <View style={styles.waiting}>
            <Icon name="cloudOff" size={24} color={colors.warn} strokeWidth={2.2} />
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
              {(index === 0 || dayLabel(items[index - 1].at) !== day) && (
                <View style={styles.dayRow}>
                  <Text style={styles.day}>{day.toUpperCase()}</Text>
                  <View style={styles.dayRule} />
                </View>
              )}
              <Pressable
                onPress={() => (item.rideId ? onShowRide(item.rideId) : item.observationId && onOpenObservation(item.observationId))}
                accessibilityRole="button"
                style={[styles.row, fresh && styles.rowNew]}
              >
                <View style={[styles.badge, { backgroundColor: item.color }]}>
                  <Icon name={item.icon} size={30} color={palette.white} strokeWidth={2.2} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, item.status === 'resolved' && styles.rowTitleDone]} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[who(names, item.memberId, memberId), item.detail, new Date(item.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <View style={styles.rowEnd}>
                  {item.status === 'open' && <Stamp label="Open" tone="open" />}
                  {item.status === 'resolved' && <Stamp label="Fixed" tone="done" tilt={3} />}
                  {fresh && <View style={styles.newDot} accessibilityLabel="New" />}
                </View>
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
  syncButton: {
    minHeight: touch.round, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(245, 239, 224, 0.3)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  syncButtonText: { color: colors.chromeText, fontSize: 14, fontWeight: '700' },
  list: { paddingHorizontal: 14, paddingTop: 16, gap: 12 },
  waiting: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.warn, backgroundColor: colors.warnBackground, borderRadius: 12,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  waitingTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  waitingDetail: { fontSize: 13, color: colors.warnText },
  empty: { fontSize: 15, lineHeight: 21, color: colors.textMuted, paddingHorizontal: 4, paddingTop: space.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginHorizontal: 2 },
  day: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2.4, color: colors.textMuted },
  dayRule: { flex: 1, height: 1, backgroundColor: colors.border },
  row: {
    minHeight: 88, backgroundColor: colors.surface, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 14,
    borderBottomWidth: 2, borderBottomColor: colors.hairline,
  },
  rowNew: { borderWidth: 2, borderColor: palette.trailDark },
  badge: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.display, fontSize: 25, lineHeight: 26, color: colors.text },
  rowTitleDone: { color: colors.textMuted },
  rowEnd: { alignSelf: 'stretch', alignItems: 'flex-end', justifyContent: 'space-between', paddingVertical: 2 },
  rowMeta: { fontSize: 14, color: colors.textMuted },
  newDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.trail },
});
