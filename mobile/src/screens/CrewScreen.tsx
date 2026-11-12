import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { errorText, fetchRanch, newInviteCode, removeMember, type Ranch } from '../api';
import AppButton from '../components/AppButton';
import FieldHeader from '../components/FieldHeader';
import Icon from '../components/Icon';
import { useTabBarHeight } from '../components/TabBar';
import { db, getState, markMemberRemoved, onDatabaseChange, setState, type Member } from '../db';
import { timeAgo } from '../format';
import { initials, useIsOwner } from '../members';
import type { Device } from '../settings';
import { colors, fonts, palette, space, touch } from '../theme';
import { useNow } from '../useNow';

type CrewMember = Member & { logged: number; lastOut: number | null };

// Cached so the code still shows with no signal, once it's been fetched
const RANCH_KEY = 'ranch';

async function loadCrew(): Promise<CrewMember[]> {
  // Hands the owner removed leave the list and the counts; their names stay on what they logged.
  // "Last out" is the latest thing they logged or rode, by the time it happened
  return db().getAllAsync<CrewMember>(`
    SELECT m.id, m.name, m.role,
      (SELECT COUNT(*) FROM observations o WHERE o.member_id = m.id AND o._status != 'deleted') AS logged,
      MAX(
        COALESCE((SELECT MAX(observed_at) FROM observations o WHERE o.member_id = m.id), 0),
        COALESCE((SELECT MAX(ended_at) FROM rides r WHERE r.member_id = m.id), 0)
      ) AS lastOut
    FROM members m
    WHERE m.removed = 0
    ORDER BY lastOut DESC, m.name`);
}

// Free ranches have a cap worth counting against; paid and founding ranches don't
function spotsLine(ranch: Pick<Ranch, 'hand_count' | 'hand_limit' | 'plan' | 'unlimited_hands'>): string {
  if (ranch.unlimited_hands) return `${ranch.plan === 'founding' ? 'Founding ranch' : 'Pro'} · no limit on hands`;
  return ranch.hand_count >= ranch.hand_limit ? `All ${ranch.hand_limit} free spots are taken.` : `${ranch.hand_count} of ${ranch.hand_limit} free spots taken.`;
}

export default function CrewScreen({ device, onOpenSettings }: { device: Device; onOpenSettings: () => void }) {
  const now = useNow(60_000);
  const tabBarHeight = useTabBarHeight();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [hands, setHands] = useState<Pick<Ranch, 'hand_count' | 'hand_limit' | 'plan' | 'unlimited_hands'> | null>(null);
  // Removing a hand and changing the code are the owner's calls (the server agrees)
  const isOwner = useIsOwner(device.memberId);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    loadCrew().then(setCrew);
  }, []);

  const refreshRanch = useCallback(
    () =>
      fetchRanch(device)
        .then((ranch) => {
          setInviteCode(ranch.invite_code);
          setHands(ranch);
          setState(RANCH_KEY, JSON.stringify(ranch));
        })
        .catch(() => {}), // offline: keep the cached code
    [device],
  );

  useEffect(() => {
    reload();
    getState(RANCH_KEY).then((json) => {
      if (!json) return;
      const ranch = JSON.parse(json);
      setInviteCode(ranch.invite_code);
      if (ranch.hand_limit) setHands(ranch);
    });
    refreshRanch();
    const sub = onDatabaseChange(['members', 'observations', 'rides'], reload);
    return () => sub.remove();
  }, [refreshRanch, reload]);

  const needsSignal = (error: unknown) => `${errorText(error)} This needs a signal. Try again at the house.`;

  function confirmRemove(member: CrewMember) {
    Alert.alert(
      `Remove ${member.name}?`,
      `Their phone stops syncing with ${device.ranchName} and their spot opens up. What they logged stays on the map. They can join again with the invite code, so get a new code if they shouldn't.`,
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await removeMember(device, member.id);
              await markMemberRemoved(member.id);
              refreshRanch();
            } catch (error) {
              Alert.alert(`Couldn't remove ${member.name}`, needsSignal(error));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function confirmNewCode() {
    Alert.alert('Get a new invite code?', "The old code stops working right away. Hands already on the crew stay; anyone you've sent the old code to needs the new one.", [
      { text: 'Keep this code', style: 'cancel' },
      {
        text: 'New code',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { invite_code } = await newInviteCode(device);
            setInviteCode(invite_code);
            // The cached copy too, so the old code doesn't come back with no signal
            const cached = await getState(RANCH_KEY);
            await setState(RANCH_KEY, JSON.stringify({ ...(cached ? JSON.parse(cached) : {}), invite_code }));
          } catch (error) {
            Alert.alert("Couldn't change the code", needsSignal(error));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  // The owner isn't a hand, so this matches the free-spot count on the invite card
  const handCount = crew.filter((m) => m.role === 'hand').length;

  function share() {
    if (!inviteCode) return;
    Share.share({
      message: `Join ${device.ranchName} on Ranch Hand. Server: ${device.apiUrl} · Invite code: ${inviteCode}`,
    });
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FieldHeader
        eyebrow={device.ranchName.toUpperCase()}
        title="Crew"
        right={
          <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} style={styles.settingsButton}>
            <Icon name="settings" size={24} color={colors.chromeText} strokeWidth={2} />
          </Pressable>
        }
        stats={[
          { value: String(handCount), label: handCount === 1 ? 'Hand' : 'Hands' },
          { value: String(crew.filter((m) => m.lastOut && now - m.lastOut < 86_400_000).length), label: 'Out today' },
          { value: String(crew.reduce((sum, m) => sum + m.logged, 0)), label: 'Logged' },
        ]}
      />

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + space.xl }]}>
        {/* Ear-tag yellow, so the code reads like the tag it's named after */}
        <View style={styles.invite}>
          <Text style={styles.inviteLabel}>INVITE A HAND</Text>
          <Text style={styles.code} selectable accessibilityLabel={inviteCode ? `Invite code ${inviteCode.split('').join(' ')}` : undefined}>
            {inviteCode ?? '—'}
          </Text>
          <Text style={styles.inviteHint}>
            {inviteCode ? 'They enter this code when they first open Ranch Hand.' : 'Connect once to see the invite code.'}
          </Text>
          {hands && (
            <Text style={styles.inviteHint}>
              {spotsLine(hands)}
            </Text>
          )}
          <AppButton title="Share the code" onPress={share} disabled={!inviteCode} variant="secondary" />
          {isOwner && (
            <Pressable onPress={confirmNewCode} disabled={busy || !inviteCode} accessibilityRole="button" hitSlop={8} style={styles.newCode}>
              <Text style={styles.newCodeText}>New code</Text>
            </Pressable>
          )}
        </View>

        {crew.length === 0 && <Text style={styles.empty}>The crew shows up here after the first sync.</Text>}
        {crew.map((member) => {
          const me = member.id === device.memberId;
          return (
            <View key={member.id} style={styles.member}>
              <View style={[styles.avatar, me && styles.avatarMe]}>
                <Text style={styles.avatarText}>{initials(member.name)}</Text>
              </View>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{member.name}</Text>
                  {me && <Text style={styles.you}>YOU</Text>}
                  {member.role === 'owner' && <Text style={styles.role}>OWNER</Text>}
                </View>
                <Text style={styles.meta}>
                  {member.logged} logged · {member.lastOut ? `last out ${timeAgo(member.lastOut)}` : 'not out yet'}
                </Text>
              </View>
              {member.lastOut && now - member.lastOut < 3 * 3_600_000 ? (
                <View accessible accessibilityLabel="Out in the last few hours">
                  <Icon name="rides" size={20} color={palette.sky} />
                </View>
              ) : null}
              {isOwner && member.role === 'hand' && !me && (
                <Pressable onPress={() => confirmRemove(member)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${member.name}`} hitSlop={8} style={styles.remove}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  list: { paddingHorizontal: 14, paddingTop: 16, gap: 12 },
  settingsButton: {
    width: touch.round, height: touch.round, borderRadius: touch.round / 2, borderWidth: 1, borderColor: 'rgba(245, 239, 224, 0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  invite: { backgroundColor: palette.harvest, borderRadius: 18, padding: space.lg, gap: space.sm },
  inviteLabel: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2.4, color: palette.pine },
  code: { fontFamily: fonts.displayBlack, fontSize: 60, lineHeight: 62, letterSpacing: 3, color: palette.pine },
  inviteHint: { fontSize: 15, fontWeight: '600', color: palette.pine, marginBottom: space.xs },
  // Quiet next to Share: it's the rare, careful action
  newCode: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center' },
  newCodeText: { fontSize: 15, fontWeight: '800', color: palette.pine, textDecorationLine: 'underline' },
  remove: { minHeight: touch.min, paddingHorizontal: space.sm, justifyContent: 'center' },
  removeText: { fontSize: 14, fontWeight: '800', color: colors.danger },
  empty: { fontSize: 15, color: colors.textMuted, paddingHorizontal: 4 },
  member: {
    minHeight: 76, backgroundColor: colors.surface, borderRadius: 16, borderBottomWidth: 2, borderBottomColor: colors.hairline,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  avatarMe: { backgroundColor: palette.leather },
  avatarText: { color: palette.white, fontFamily: fonts.displayBlack, fontSize: 22 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: colors.text },
  you: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: palette.white, backgroundColor: palette.leather, borderRadius: 4, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1 },
  role: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: colors.textMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  meta: { fontSize: 14, color: colors.textMuted },
});
