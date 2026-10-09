import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { joinRanch } from '../api';
import AppButton from '../components/AppButton';
import Logo from '../components/Logo';
import { DEFAULT_API_URL, saveDevice, type Device } from '../settings';
import { colors, fonts, palette, radius } from '../theme';

export default function SetupScreen({ onJoined }: { onJoined: (device: Device) => void }) {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.lockup}>
        <Logo size={52} />
        <Text style={styles.wordmark}>RANCH HAND</Text>
      </View>
      <Text style={styles.title}>Join a ranch</Text>
      <Text style={styles.label}>Server</Text>
      <TextInput style={styles.input} value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Text style={styles.label}>Invite code</Text>
      <TextInput style={styles.input} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" />
      <Text style={styles.label}>Your name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={{ marginTop: 12 }}>
        <AppButton title={busy ? 'Joining…' : 'Join'} onPress={join} disabled={busy || !inviteCode || !name} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // The canvas's lockup: the tag on a Pine bar with the name in the display face
  lockup: {
    flexDirection: 'row', alignItems: 'center', gap: 14, alignSelf: 'stretch', backgroundColor: palette.pine,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 20,
  },
  wordmark: { fontFamily: fonts.displayBlack, fontSize: 36, lineHeight: 38, letterSpacing: 0.4, color: palette.canvas },
  container: { flex: 1, padding: 20, gap: 6, backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, padding: 12, marginBottom: 8,
    backgroundColor: colors.surface, color: colors.text, fontSize: 16,
  },
  error: { color: colors.danger, fontWeight: '600' },
});
