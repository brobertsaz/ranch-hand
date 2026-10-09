import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useNetworkState } from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import { createObservation, liveWaypoints, newId, type Kind, type PlaceChoice, type Waypoint } from '../db';
import { clockParts, formatDistance } from '../format';
import { composeNote, initialStatus, nearestPlace, nextPlaceName, PLACE_KIND, WAYPOINT_INFO } from '../kinds';
import { keepPhoto, photoFile } from '../photoFiles';
import { colors, fonts, palette, sync, touch } from '../theme';
import TagScreen, { type Fix, type PlaceMode } from './TagScreen';

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
  const [fix, setFix] = useState<Fix>('pending');
  const [step, setStep] = useState<'camera' | 'tag'>('camera');
  const [photo, setPhoto] = useState<{ id: string; uri: string } | null>(null);
  const [kind, setKind] = useState<Kind>('sick_animal');
  const [tagNumber, setTagNumber] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  // null: let the app decide (join a place nearby, else save a new one)
  const [placeMode, setPlaceMode] = useState<PlaceMode | null>(null);

  useEffect(() => {
    liveWaypoints().then(setWaypoints);
  }, []);

  const placeKind = PLACE_KIND[kind];
  const nearby = placeKind && fix && fix !== 'pending' ? nearestPlace(waypoints, placeKind, [fix.coords.longitude, fix.coords.latitude]) : null;
  const newPlaceName = placeKind ? nextPlaceName(waypoints, placeKind) : '';
  const mode: PlaceMode = placeMode ?? (nearby ? 'existing' : 'new');

  function placeChoice(): PlaceChoice {
    if (!placeKind) return null;
    if (mode === 'existing' && nearby) return { waypointId: nearby.waypoint.id };
    if (mode === 'new') return { create: { kind: placeKind, name: newPlaceName } };
    return null;
  }

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    const request = Location.requestForegroundPermissionsAsync().then(({ granted }) => (granted ? locate() : null));
    location.current = request;
    request.then((result) => location.current === request && setFix(result));
  }, [permission, requestPermission]);

  async function shoot() {
    const picture = await camera.current?.takePictureAsync({ quality: 0.6 });
    if (!picture) return;
    const id = newId();
    const file = await keepPhoto(picture.uri, id);
    setPhoto({ id, uri: file.uri });
    setStep('tag');
  }

  function discardPhoto() {
    if (!photo) return;
    const file = photoFile(photo.id);
    if (file.exists) file.delete();
    setPhoto(null);
  }

  function retake() {
    discardPhoto();
    setStep('camera');
  }

  function cancel() {
    discardPhoto();
    onDone(false);
  }

  async function save() {
    setSaving(true);
    const result = await (location.current ?? locate());
    if (!result) {
      setSaving(false);
      Alert.alert('No GPS fix yet', 'Step into the open and try again.');
      return;
    }
    await createObservation(
      {
        kind,
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
        observed_at: Date.now(),
        // Tag numbers only mean something on an animal
        tag_number: kind === 'sick_animal' ? tagNumber.trim() || null : null,
        note: composeNote(picks, note),
        status: initialStatus(kind, picks),
      },
      photo?.id ?? null,
      memberId,
      placeChoice(),
    );
    onDone(true);
  }

  if (step === 'tag') {
    return (
      <TagScreen
        photoUri={photo?.uri ?? null}
        fix={fix}
        kind={kind}
        onKind={(next) => {
          // Each kind has its own list, so picks from the last one don't carry over
          if (next !== kind) {
            setPicks([]);
            setPlaceMode(null);
          }
          setKind(next);
        }}
        place={
          placeKind
            ? {
                label: WAYPOINT_INFO[placeKind].label,
                nearby: nearby ? { name: nearby.waypoint.name, distance: formatDistance(nearby.meters) } : null,
                newName: newPlaceName,
                locating: fix === 'pending',
                mode,
                onMode: setPlaceMode,
              }
            : null
        }
        picks={picks}
        onTogglePick={(pick) => setPicks((current) => (current.includes(pick) ? current.filter((p) => p !== pick) : [...current, pick]))}
        tagNumber={tagNumber}
        onTagNumber={setTagNumber}
        note={note}
        onNote={setNote}
        saving={saving}
        onSave={save}
        onCancel={cancel}
        onRetake={retake}
      />
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.permission}>
        <StatusBar style="light" />
        <Icon name="camera" size={40} color={colors.chromeText} />
        <Text style={styles.permissionText}>Ranch Hand needs the camera to photograph the ear tag.</Text>
        <AppButton title="Allow camera" onPress={requestPermission} />
        <AppButton title="Log without a photo" variant="chrome" onPress={() => setStep('tag')} />
        <AppButton title="Cancel" variant="chrome" onPress={cancel} />
      </View>
    );
  }

  return <CameraStep camera={camera} fix={fix} onShoot={shoot} onSkip={() => setStep('tag')} onClose={cancel} />;
}

type CameraStepProps = {
  camera: React.RefObject<CameraView | null>;
  fix: Fix;
  onShoot: () => void;
  onSkip: () => void;
  onClose: () => void;
};

// Mockup 2 · Snap the tag
function CameraStep({ camera, fix, onShoot, onSkip, onClose }: CameraStepProps) {
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  const online = Boolean(network.isInternetReachable ?? network.isConnected);
  const [now, setNow] = useState(Date.now());
  const clock = clockParts(now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const gps =
    fix === 'pending'
      ? { label: 'Finding GPS…', color: sync.pending }
      : fix
        ? { label: `GPS ±${Math.round(fix.coords.accuracy ?? 0)} m`, color: sync.synced }
        : { label: 'No GPS', color: sync.failed };

  return (
    <View style={styles.camera}>
      <StatusBar style="light" />
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.frame} pointerEvents="none">
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
      </View>

      <View style={[styles.topRow, { top: insets.top + 8 }]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close camera" style={styles.close}>
          <Icon name="close" size={22} color={colors.chromeText} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.pills}>
          <View style={styles.pill}>
            <View style={[styles.dot, { backgroundColor: gps.color }]} />
            <Text style={styles.pillText}>{gps.label}</Text>
          </View>
          <View style={styles.pill}>
            {online ? <View style={[styles.dot, { backgroundColor: sync.synced }]} /> : <Icon name="cloudOff" size={16} color={palette.harvest} strokeWidth={2.4} />}
            <Text style={styles.pillText}>{online ? 'Signal' : 'No signal'}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.hintRow, { bottom: SHUTTER_BAR + insets.bottom + 24 }]} pointerEvents="none">
        <Text style={styles.hint}>Get the ear tag in frame</Text>
      </View>

      <View style={[styles.shutterBar, { height: SHUTTER_BAR + insets.bottom, paddingBottom: insets.bottom }]}>
        <Pressable onPress={onSkip} accessibilityRole="button" style={styles.skip}>
          <Text style={styles.skipText}>No photo</Text>
        </Pressable>
        <Pressable onPress={onShoot} accessibilityRole="button" accessibilityLabel="Take photo" style={styles.shutter}>
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.clock} accessibilityLabel={`Time ${clock.time} ${clock.caption}`}>
          <Text style={styles.clockTime}>{clock.time}</Text>
          <Text style={styles.clockCaption}>{clock.caption}</Text>
        </View>
      </View>
    </View>
  );
}

const SHUTTER_BAR = 136;
const FRAME = 160;
const CORNER = 28;

const styles = StyleSheet.create({
  permission: { flex: 1, backgroundColor: colors.chrome, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  permissionText: { color: colors.chromeText, fontSize: 17, lineHeight: 24, textAlign: 'center', marginBottom: 8 },
  camera: { flex: 1, backgroundColor: colors.chrome },
  frame: { position: 'absolute', alignSelf: 'center', top: '36%', width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: palette.white },
  topLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 8 },
  topRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 8 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 8 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 8 },
  topRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: touch.round, height: touch.round, borderRadius: touch.round / 2, backgroundColor: 'rgba(16, 23, 19, 0.75)', alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(16, 23, 19, 0.82)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  pillText: { color: colors.chromeText, fontSize: 14, fontWeight: '700' },
  hintRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    backgroundColor: 'rgba(16, 23, 19, 0.82)', color: colors.chromeText, borderRadius: 999, overflow: 'hidden',
    paddingVertical: 10, paddingHorizontal: 18, fontFamily: fonts.display, fontSize: 20,
  },
  shutterBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.chrome,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24,
  },
  skip: { minWidth: 88, minHeight: touch.min, justifyContent: 'center' },
  skipText: { color: colors.chromeText, fontSize: 16, fontWeight: '700' },
  shutter: {
    width: touch.shutter, height: touch.shutter, borderRadius: touch.shutter / 2, borderWidth: 5,
    borderColor: palette.canvas, padding: 5, backgroundColor: colors.chrome,
  },
  shutterInner: { flex: 1, borderRadius: touch.shutter / 2, backgroundColor: palette.trail },
  clock: { minWidth: 88, alignItems: 'flex-end' },
  clockTime: { fontFamily: fonts.display, fontSize: 22, color: colors.chromeText, textAlign: 'center' },
  clockCaption: { fontSize: 12, color: colors.chromeTextMuted, textAlign: 'center' },
});
