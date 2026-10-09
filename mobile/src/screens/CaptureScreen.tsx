import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createObservation, KINDS, newId, type Kind } from '../db';
import AppButton from '../components/AppButton';
import { keepPhoto } from '../photoFiles';
import { colors, palette, radius, touch } from '../theme';

// Ask for a fix as soon as the camera opens, so it's ready by the time the form is filled in
async function locate(): Promise<Location.LocationObject | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000));
  const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  return (await Promise.race([fix, timeout])) ?? (await Location.getLastKnownPositionAsync());
}

type Props = { memberId: string; onDone: (saved: boolean) => void };

export default function CaptureScreen({ memberId, onDone }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const location = useRef<Promise<Location.LocationObject | null> | null>(null);
  const [photo, setPhoto] = useState<{ id: string; uri: string } | null>(null);
  const [kind, setKind] = useState<Kind>('sick_animal');
  const [tagNumber, setTagNumber] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    location.current = Location.requestForegroundPermissionsAsync().then(({ granted }) => (granted ? locate() : null));
  }, [permission, requestPermission]);

  async function shoot() {
    const picture = await camera.current?.takePictureAsync({ quality: 0.6 });
    if (!picture) return;
    const id = newId();
    const file = await keepPhoto(picture.uri, id);
    setPhoto({ id, uri: file.uri });
  }

  async function save() {
    setSaving(true);
    const fix = await (location.current ?? locate());
    if (!fix) {
      setSaving(false);
      Alert.alert('No GPS fix yet', 'Step into the open and try again.');
      return;
    }
    await createObservation(
      {
        kind,
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy: fix.coords.accuracy,
        observed_at: Date.now(),
        tag_number: tagNumber.trim() || null,
        note: note.trim() || null,
      },
      photo?.id ?? null,
      memberId,
    );
    onDone(true);
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.message}>Camera permission is needed to take the photo.</Text>
        <AppButton title="Grant" onPress={requestPermission} />
        <AppButton title="Cancel" variant="ghost" onPress={() => onDone(false)} />
      </SafeAreaView>
    );
  }

  if (!photo) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
        <SafeAreaView style={styles.shutterBar}>
          <AppButton title="Cancel" variant="chrome" onPress={() => onDone(false)} />
          <Pressable style={styles.shutter} onPress={shoot} accessibilityLabel="Take photo">
            <View style={styles.shutterInner} />
          </Pressable>
          <AppButton title="No photo" variant="chrome" onPress={() => setPhoto({ id: '', uri: '' })} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {photo.uri ? <Image source={{ uri: photo.uri }} style={styles.preview} /> : null}
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: k === kind }}
              style={[styles.kind, k === kind && styles.kindOn]}
            >
              <Text style={[styles.kindText, k === kind && styles.kindTextOn]}>{k.replace('_', ' ')}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Tag number" value={tagNumber} onChangeText={setTagNumber} keyboardType="number-pad" />
        <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Note" value={note} onChangeText={setNote} multiline />
        <AppButton title={saving ? 'Waiting for GPS…' : 'Save'} onPress={save} disabled={saving} style={styles.save} />
        <AppButton title="Discard" variant="ghost" onPress={() => onDone(false)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  message: { color: colors.text, fontSize: 16, textAlign: 'center' },
  shutterBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'center', paddingTop: 16, paddingBottom: 24, backgroundColor: colors.chrome,
  },
  shutter: {
    width: touch.shutter, height: touch.shutter, borderRadius: touch.shutter / 2, borderWidth: 5,
    borderColor: palette.canvas, padding: 5, backgroundColor: colors.chrome,
  },
  shutterInner: { flex: 1, borderRadius: touch.shutter / 2, backgroundColor: palette.trail },
  form: { padding: 16, gap: 12 },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    minHeight: touch.min, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.input, backgroundColor: colors.surface,
  },
  kindOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindText: { color: colors.text, fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  kindTextOn: { color: colors.primaryText, fontWeight: '800' },
  input: {
    borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, padding: 12,
    backgroundColor: colors.surface, color: colors.text, fontSize: 16,
  },
  save: { minHeight: touch.primary },
});
