import { addDatabaseChangeListener } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchRanch } from '../api';
import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import { useTabBarHeight } from '../components/TabBar';
import { db, getState, setState, type Member } from '../db';
import { timeAgo } from '../format';
import { initials } from '../members';
import type { Device } from '../settings';
import { colors, fonts, palette, space } from '../theme';

type CrewMember = Member & { logged: number; lastOut: number | null };

// Cached so the code still shows with no signal, once it's been fetched
const RANCH_KEY = 'ranch';

async function loadCrew(): Promise<CrewMember[]> {
  // "Last out" is the latest thing they logged or rode, by the time it happened
  return db().getAllAsync<CrewMember>(`
    SELECT m.id, m.name, m.role,
      (SELECT COUNT(*) FROM observations o WHERE o.member_id = m.id AND o._status != 'deleted') AS logged,
      MAX(
        COALESCE((SELECT MAX(observed_at) FROM observations o WHERE o.member_id = m.id), 0),
        COALESCE((SELECT MAX(ended_at) FROM rides r WHERE r.member_id = m.id), 0)
      ) AS lastOut
    FROM members m
    ORDER BY lastOut DESC, m.name`);
}

export default function CrewScreen({ device }: { device: Device }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadCrew().then(setCrew);
  }, []);

  useEffect(() => {
    reload();
    getState(RANCH_KEY).then((json) => json && setInviteCode(JSON.parse(json).invite_code));
    fetchRanch(device)
      .then((ranch) => {
        setInviteCode(ranch.invite_code);
        setState(RANCH_KEY, JSON.stringify(ranch));
      })
      .catch(() => {}); // offline: keep the cached code
    const sub = addDatabaseChangeListener(({ tableName }) => ['members', 'observations', 'rides'].includes(tableName) && reload());
    return () => sub.remove();
  }, [device, reload]);

  function share() {
    if (!inviteCode) return;
    Share.share({
      message: `Join ${device.ranchName} on Ranch Hand. Server: ${device.apiUrl} · Invite code: ${inviteCode}`,
    });
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text style={styles.title} accessibilityRole="header">Crew</Text>
        <Text style={styles.headerMeta}>
          {device.ranchName} · {crew.length} {crew.length === 1 ? 'hand' : 'hands'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + space.xl }]}>
        <View style={styles.invite}>
          <Text style={styles.inviteLabel}>Invite a hand</Text>
          <Text style={styles.code} selectable accessibilityLabel={inviteCode ? `Invite code ${inviteCode.split('').join(' ')}` : undefined}>
            {inviteCode ?? '—'}
          </Text>
          <Text style={styles.inviteHint}>
            {inviteCode ? 'They enter this code when they first open Ranch Hand.' : 'Connect once to see the invite code.'}
          </Text>
          <AppButton title="Share the code" onPress={share} disabled={!inviteCode} variant="secondary" />
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
              {member.lastOut && Date.now() - member.lastOut < 3 * 3_600_000 ? (
                <View accessible accessibilityLabel="Out in the last few hours">
                  <Icon name="rides" size={20} color={palette.sky} />
                </View>
              ) : null}
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
  header: { backgroundColor: colors.chrome, paddingHorizontal: space.lg, paddingBottom: 18, gap: 6 },
  title: { fontFamily: fonts.displayBlack, fontSize: 44, lineHeight: 44, color: colors.chromeText },
  headerMeta: { fontSize: 14, color: colors.chromeTextMuted },
  list: { paddingHorizontal: 12, paddingTop: 14, gap: 10 },
  invite: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: space.lg, gap: space.sm },
  inviteLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.textMuted },
  code: { fontFamily: fonts.displayBlack, fontSize: 48, lineHeight: 50, letterSpacing: 2, color: colors.text },
  inviteHint: { fontSize: 14, color: colors.textMuted, marginBottom: space.xs },
  empty: { fontSize: 15, color: colors.textMuted, paddingHorizontal: 4 },
  member: {
    minHeight: 64, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(23, 27, 24, 0.14)', borderRadius: 12,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  avatarMe: { backgroundColor: palette.leather },
  avatarText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  you: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: palette.white, backgroundColor: palette.leather, borderRadius: 4, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1 },
  role: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: colors.textMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  meta: { fontSize: 13, color: colors.textMuted },
});
