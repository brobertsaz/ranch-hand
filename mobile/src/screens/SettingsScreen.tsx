import { reloadAppAsync } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import { Contours } from '../components/FieldHeader';
import Icon from '../components/Icon';
import { colors, fonts, palette, radius, space, themeMode, touch } from '../theme';
import { saveThemeMode, type ThemeMode } from '../themeMode';
import type { SyncState } from '../useSync';

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
  onClose: () => void;
};

// Everything that isn't the map: how the app looks, sync, help, and leaving the ranch. Opened from the gear
// on the Crew tab, so the map's layers button only holds map things.
export default function SettingsScreen({ ranchName, sync, onHelp, onLeave, onClose }: Props) {
  const insets = useSafeAreaInsets();

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

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}>
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
            <Text style={styles.hint}>Clears this ranch from this phone. Everything synced stays with the crew. Get back in with the invite code, or with Google if you're the owner.</Text>
            <AppButton variant="ghost" title="Leave this ranch" onPress={onLeave} />
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
});
