import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { joinRanch } from '../api';
import { DEFAULT_API_URL, saveDevice, type Device } from '../settings';

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
      <Text style={styles.title}>Join a ranch</Text>
      <Text>Server</Text>
      <TextInput style={styles.input} value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Text>Invite code</Text>
      <TextInput style={styles.input} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" />
      <Text>Your name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={{ marginTop: 12 }}>
        <Button title={busy ? 'Joining…' : 'Join'} onPress={join} disabled={busy || !inviteCode || !name} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 6 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10, marginBottom: 8 },
  error: { color: '#b00020' },
});
