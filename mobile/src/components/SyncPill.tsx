import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, palette, radius, sync, touch } from '../theme';
import type { SyncState } from '../useSync';
import Icon from './Icon';

// The map header's sync status, and the button that syncs or explains
export default function SyncPill({ state, unsynced, onPress }: { state: SyncState; unsynced: number; onPress: () => void }) {
  const photos = state.pending.uploads;
  const turnedDown = state.problems.length;
  // A failed run only shows with signal: with none, "Offline" is the truer word for why nothing went up
  const pill = state.syncing
    ? { icon: 'refresh' as const, color: colors.chromeText, label: 'Syncing…', look: null, hint: 'Sync now' }
    : state.signedOut
      ? { icon: 'cloudOff' as const, color: palette.white, label: 'Signed out', look: styles.syncPillFailed, hint: 'See why' }
      : state.online && state.error
        ? { icon: 'cloudOff' as const, color: palette.white, label: 'Sync failed', look: styles.syncPillFailed, hint: 'See why' }
        : unsynced > 0
          ? { icon: 'cloudOff' as const, color: palette.harvest, label: `${unsynced} waiting`, look: styles.syncPillWarn, hint: 'Sync now' }
          : photos > 0
            ? { icon: 'cloudOff' as const, color: palette.harvest, label: `${photos} photo${photos === 1 ? '' : 's'} waiting`, look: styles.syncPillWarn, hint: 'Sync now' }
            : !state.online
              ? { icon: 'cloudOff' as const, color: palette.harvest, label: 'Offline', look: styles.syncPillWarn, hint: 'Sync now' }
              : turnedDown > 0
                ? { icon: 'cloudOff' as const, color: palette.harvest, label: `${turnedDown} not sent`, look: styles.syncPillWarn, hint: 'See why in Settings' }
                : { icon: 'check' as const, color: sync.synced, label: 'Synced', look: null, hint: 'Sync now' };

  return (
    <Pressable
      onPress={onPress}
      disabled={state.syncing}
      accessibilityRole="button"
      accessibilityLabel={`${pill.label}. ${pill.hint}`}
      style={[styles.syncPill, pill.look]}
    >
      <Icon name={pill.icon} size={18} color={pill.color} strokeWidth={2.2} />
      <Text style={styles.syncPillText}>{pill.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  syncPill: {
    height: touch.round, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(245, 239, 224, 0.2)', backgroundColor: colors.chromeRaised,
  },
  syncPillWarn: { borderColor: 'rgba(227, 163, 59, 0.5)', backgroundColor: 'rgba(227, 163, 59, 0.14)' },
  // Its own look, so a failed sync can't be mistaken for "waiting for signal"
  syncPillFailed: { borderColor: sync.failed, backgroundColor: sync.failed },
  syncPillText: { color: colors.chromeText, fontSize: 15, fontWeight: '700' },
});
