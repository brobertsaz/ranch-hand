import { reloadAppAsync } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import { Contours } from '../components/FieldHeader';
import Icon from '../components/Icon';
import { canStartRanch } from '../google';
import { colors, fonts, palette, radius, space, themeMode, touch } from '../theme';
import { saveThemeMode, type ThemeMode } from '../themeMode';
import type { SyncProblem } from '../db';
import { signedOutText, type SyncState } from '../useSync';

const THEME_MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'auto', label: 'Auto' },
];

type Props = {
  ranchName: string;
  sync: SyncState & { syncNow: () => void };
  onHelp: () => void;
  onLeave: () => void;
  // Explains a signed-out phone and offers to join again
  onSignedOut: () => void;
  isOwner: boolean;
  // A ride is recording, which has to stop before the account can go
  riding: boolean;
  // What on this phone hasn't reached the crew, as a sentence for the confirm ('' when nothing)
  unsynced: string;
  // Asks the server, then clears the phone. Resolves either way; it reports its own failure.
  onDeleteAccount: () => Promise<void>;
  onClose: () => void;
};

const PROBLEM_LABEL: Record<SyncProblem['table'], string> = { waypoints: 'place', observations: 'pin', photos: 'photo', rides: 'ride' };

// "2 pins: Not allowed" — one line per reason, so ten records refused for the same thing don't fill the screen
function describeProblems(problems: SyncProblem[]): string[] {
  const groups = new Map<string, number>();
  for (const p of problems) {
    const key = `${PROBLEM_LABEL[p.table]}|${p.reason ?? 'No reason given'}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([key, n]) => {
    const [label, reason] = key.split('|');
    return `${n} ${label}${n === 1 ? '' : 's'}: ${reason}`;
  });
}

// Everything that isn't the map: how the app looks, sync, help, and leaving the ranch. Opened from the gear
// on the Crew tab, so the map's layers button only holds map things.
export default function SettingsScreen({ ranchName, sync, onHelp, onLeave, onSignedOut, isOwner, riding, unsynced, onDeleteAccount, onClose }: Props) {
  const insets = useSafeAreaInsets();
  // The owner's second step: the ranch name typed out, since this deletes the ranch for the whole crew
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const nameMatches = typed.trim().toLowerCase() === ranchName.trim().toLowerCase();

  async function deleteNow() {
    setDeleting(true);
    try {
      await onDeleteAccount();
    } finally {
      setDeleting(false);
    }
  }

  // Two steps on purpose: what it does, then "are you sure". Deleting is the server's job, so it needs a signal.
  function startDeleting() {
    if (riding) return Alert.alert('Stop your ride first', 'Hold Stop on the map, then delete your account.');
    if (sync.signedOut) return Alert.alert('This phone is signed out', "It can't reach your account any more, so there's nothing it can delete. Leave this ranch to clear the phone.");
    if (!sync.online) return Alert.alert('This needs a signal', 'Deleting your account happens on the server. Try again at the house.');
    Alert.alert(
      isOwner ? `Delete ${ranchName} for everyone?` : 'Delete your account?',
      isOwner
        ? `You own ${ranchName}, so deleting your account deletes the whole ranch: every hand loses access, and all its observations, photos, places, rides and maps are gone for everyone. It can't be undone.${unsynced}`
        : `Your name is erased and this phone loses access to ${ranchName}. What you logged stays with the ranch, shown as logged by "Former hand". It can't be undone.${unsynced}`,
      [
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: isOwner ? () => setTyping(true) : confirmAsHand },
      ],
    );
  }

  function confirmAsHand() {
    Alert.alert('Delete your account for good?', 'This is the last step. There is no getting it back.', [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete my account', style: 'destructive', onPress: deleteNow },
    ]);
  }

  function stopTyping() {
    setTyping(false);
    setTyped('');
  }

  // Every screen's colors are set when the app starts, so a new look takes a quick restart
  async function chooseThemeMode(next: ThemeMode) {
    if (next === themeMode) return;
    await saveThemeMode(next);
    await reloadAppAsync('Theme changed');
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Contours />
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to crew" style={styles.back}>
          <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">SETTINGS</Text>
      </View>

      {/* The owner types the ranch name at the very bottom, so the list has to move up clear of the keyboard */}
      <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">LOOK</Text>
          <View style={styles.card}>
            <View style={styles.choices}>
              {THEME_MODES.map(({ mode, label }) => (
                <Pressable
                  key={mode}
                  onPress={() => chooseThemeMode(mode)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: themeMode === mode }}
                  style={[styles.choice, themeMode === mode && styles.choiceOn]}
                >
                  <Text style={[styles.choiceText, themeMode === mode && styles.choiceTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>Light reads best in the sun, Dark before sunup and after dark. Auto follows your phone. Switching restarts the app.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">SYNC</Text>
          <View style={styles.card}>
            <Text style={styles.text}>
              {sync.online ? 'Online' : 'No signal'} · {sync.pending.records} records and {sync.pending.uploads} photos waiting
            </Text>
            {sync.lastResult && <Text style={styles.hint}>Last run {sync.lastResult}</Text>}
            {sync.signedOut && (
              <>
                <Text style={styles.problem}>{signedOutText(sync.signedOut, ranchName)} Nothing syncs until it joins again.</Text>
                <AppButton title="Join again" onPress={onSignedOut} />
              </>
            )}
            {!sync.signedOut && sync.error && <Text style={styles.problem}>{sync.error}</Text>}
            {sync.problems.length > 0 && (
              <View style={styles.problems}>
                <Text style={styles.problem}>
                  The server didn&apos;t take {sync.problems.length} thing{sync.problems.length === 1 ? '' : 's'}. {sync.problems.length === 1 ? 'It stays' : 'They stay'} on this phone only:
                </Text>
                {describeProblems(sync.problems).map((line) => (
                  <Text key={line} style={styles.hint}>{line}</Text>
                ))}
              </View>
            )}
            <AppButton
              variant="secondary"
              title={sync.syncing ? 'Syncing…' : 'Sync now'}
              onPress={sync.syncNow}
              disabled={sync.syncing}
              icon={<Icon name="refresh" size={20} color={palette.white} />}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">HELP</Text>
          <Pressable onPress={onHelp} accessibilityRole="button" style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowTitle}>Help and how-tos</Text>
            <Icon name="chevronRight" size={20} color={colors.textMuted} strokeWidth={2.4} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{ranchName.toUpperCase()}</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>Clears this ranch and its offline maps from this phone, and opens up a hand&apos;s spot on the crew. Everything synced stays with the crew. Get back in with an invite code{canStartRanch ? ", or with Google if you're the owner" : ''}.</Text>
            <AppButton variant="ghost" title="Leave this ranch" onPress={onLeave} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">YOUR ACCOUNT</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>
              {isOwner
                ? `Deletes your account and, because you own it, all of ${ranchName}: every hand's access and everything the crew logged. This is not the same as leaving, and it can't be undone.`
                : `Erases your name and ends this phone's access for good. What you logged stays with the ranch as logged by "Former hand". This is not the same as leaving, and it can't be undone.`}
              {sync.online ? '' : ' It needs a signal.'}
            </Text>
            {typing ? (
              <>
                <Text style={styles.problem} nativeID="delete-label">Type the ranch name, {ranchName}, to delete it for everyone.</Text>
                <TextInput
                  style={styles.input}
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder={ranchName}
                  placeholderTextColor={colors.placeholder}
                  accessibilityLabelledBy="delete-label"
                  editable={!deleting}
                />
                <AppButton
                  title={deleting ? 'Deleting…' : `Delete ${ranchName} and my account`}
                  onPress={deleteNow}
                  disabled={!nameMatches || deleting || !sync.online}
                  style={styles.destructive}
                />
                <AppButton variant="ghost" title="Keep my account" onPress={stopTyping} disabled={deleting} />
              </>
            ) : (
              <Pressable onPress={startDeleting} disabled={deleting} accessibilityRole="button" style={styles.deleteLink}>
                <Text style={styles.deleteLinkText}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.chrome, paddingHorizontal: space.lg, paddingBottom: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.md, overflow: 'hidden' },
  back: { width: touch.round, height: touch.round, borderRadius: touch.round / 2, backgroundColor: colors.chromeRaised, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayBlack, fontSize: 58, lineHeight: 58, color: colors.chromeText },
  body: { padding: space.lg, gap: space.xl },
  section: { gap: space.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2.4, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  row: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md },
  rowTitle: { flex: 1, fontFamily: fonts.display, fontSize: 21, lineHeight: 23, color: colors.text },
  pressed: { opacity: 0.8 },
  choices: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1, minHeight: touch.min, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  choiceOn: { backgroundColor: palette.sky, borderColor: palette.sky },
  choiceText: { fontSize: 17, fontWeight: '800', color: colors.text },
  choiceTextOn: { color: palette.white },
  text: { fontSize: 16, lineHeight: 23, color: colors.text },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  input: {
    minHeight: touch.min, borderWidth: 2, borderColor: colors.input, borderRadius: radius.md, paddingHorizontal: space.md,
    fontSize: 17, color: colors.text, backgroundColor: colors.surface,
  },
  destructive: { backgroundColor: palette.destructive },
  deleteLink: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center' },
  deleteLinkText: { fontSize: 16, fontWeight: '800', color: colors.danger },
  problems: { gap: space.xs },
  problem: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.danger },
});
