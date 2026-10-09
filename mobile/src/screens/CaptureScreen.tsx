import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createObservation, KINDS, newId, type Kind } from '../db';
import { keepPhoto } from '../photoFiles';

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
        <Text>Camera permission is needed to take the photo.</Text>
        <Button title="Grant" onPress={requestPermission} />
        <Button title="Cancel" onPress={() => onDone(false)} />
      </SafeAreaView>
    );
  }

  if (!photo) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
        <SafeAreaView style={styles.shutterBar}>
          <Button title="Cancel" onPress={() => onDone(false)} />
          <Pressable style={styles.shutter} onPress={shoot} accessibilityLabel="Take photo" />
          <Button title="No photo" onPress={() => setPhoto({ id: '', uri: '' })} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {photo.uri ? <Image source={{ uri: photo.uri }} style={styles.preview} /> : null}
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Pressable key={k} onPress={() => setKind(k)} style={[styles.kind, k === kind && styles.kindOn]}>
              <Text>{k.replace('_', ' ')}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Tag number" value={tagNumber} onChangeText={setTagNumber} keyboardType="number-pad" />
        <TextInput style={styles.input} placeholder="Note" value={note} onChangeText={setNote} multiline />
        <Button title={saving ? 'Waiting for GPS…' : 'Save'} onPress={save} disabled={saving} />
        <Button title="Discard" onPress={() => onDone(false)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', gap: 12 },
  shutterBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 24 },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'white', borderWidth: 4, borderColor: '#ccc' },
  form: { padding: 16, gap: 10 },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: 8 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#999' },
  kindOn: { backgroundColor: '#f2d36b', borderColor: '#b8961f' },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10 },
});
