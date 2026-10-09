import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, joinRanch } from '../api';
import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import { DEFAULT_API_URL, saveDevice, type Device } from '../settings';
import { colors, fonts, palette, radius, space } from '../theme';

// The first screen: the brand up top, then join a ranch with the code the owner shares from the Crew tab.
// No accounts yet; the server address hides behind a link since testers never need to change it.
export default function SetupScreen({ onJoined }: { onJoined: (device: Device) => void }) {
  const insets = useSafeAreaInsets();
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [showServer, setShowServer] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const url = apiUrl.trim().replace(/\/+$/, '');
      const result = await joinRanch(url, inviteCode, name.trim());
      const device = { apiUrl: url, token: result.token, memberId: result.member_id, ranchName: result.ranch.name };
      await saveDevice(device);
      onJoined(device);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 404
            ? "That code didn't match a ranch. Check it with whoever sent it."
            : `The server had a problem (${e.status}). Try again in a minute.`
          : "Can't reach the server. Joining needs signal once; after that the app works without it.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { paddingTop: insets.top + space.xxl }]}>
          <Logo size={88} />
          <Text style={styles.wordmark} accessibilityRole="header">RANCH HAND</Text>
          <Text style={styles.tagline}>Log what you see on the ranch. The whole crew sees it, even out where there's no signal.</Text>
        </View>

        <View style={[styles.form, { paddingBottom: insets.bottom + space.xl }]}>
          <Text style={styles.title}>Join your ranch</Text>

          <Text style={styles.label} nativeID="code-label">Invite code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={inviteCode}
            onChangeText={(text) => setInviteCode(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="KARACREEK"
            placeholderTextColor="rgba(23, 27, 24, 0.3)"
            accessibilityLabelledBy="code-label"
          />
          <Text style={styles.hint}>The ranch owner finds it on their Crew tab.</Text>

          <Text style={styles.label} nativeID="name-label">Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="What the crew calls you"
            placeholderTextColor={colors.textMuted}
            accessibilityLabelledBy="name-label"
            returnKeyType="go"
            onSubmitEditing={() => inviteCode && name.trim() && join()}
          />

          {error && (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <AppButton
            size="large"
            title={busy ? 'Joining…' : 'Join the crew'}
            onPress={join}
            disabled={busy || !inviteCode || !name.trim()}
            style={{ marginTop: space.md }}
          />

          <Pressable onPress={() => setShowServer((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showServer }} style={styles.serverToggle}>
            <Text style={styles.serverToggleText}>Server settings</Text>
            <Icon name="chevronRight" size={16} color={colors.textMuted} strokeWidth={2.4} />
          </Pressable>
          {showServer && (
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Server address"
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: palette.pine, alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  wordmark: { fontFamily: fonts.displayBlack, fontSize: 52, lineHeight: 54, letterSpacing: 0.5, color: palette.canvas, marginTop: space.sm },
  tagline: { fontSize: 17, lineHeight: 24, color: colors.chromeTextMuted, textAlign: 'center', maxWidth: 320 },
  form: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text, marginBottom: space.sm },
  label: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3, color: colors.text, marginTop: space.sm },
  input: {
    minHeight: 52, borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, paddingHorizontal: 14,
    backgroundColor: colors.surface, color: colors.text, fontSize: 17,
  },
  codeInput: { fontFamily: fonts.displayBlack, fontSize: 30, letterSpacing: 2, minHeight: 60 },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { backgroundColor: '#F8E1DC', borderRadius: radius.md, padding: 12, marginVertical: space.sm },
  errorText: { color: palette.destructive, fontSize: 15, fontWeight: '600' },
  serverToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: space.sm },
  serverToggleText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
