import { Camera, Map, type MapRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, setHeadquarters } from '../api';
import AppButton from '../components/AppButton';
import Logo from '../components/Logo';
import { locate } from '../locate';
import { mapStyleUrl, type Device } from '../settings';
import { colors, fonts, palette, radius, space, touch } from '../theme';

// Middle of the lower 48, for an owner who won't share their location: they zoom in from there
const US_CENTER: [number, number] = [-98.6, 39.8];

// Right after an owner starts a ranch: move the map until the pin sits on the house or barns. The server
// sharpens about a mile around it, so the first look at the ranch isn't blurry. The pin stays in the middle
// and the map moves under it, which is easier with gloves than dragging a small marker.
export default function HeadquartersScreen({ device, onDone }: { device: Device; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const map = useRef<MapRef>(null);
  const [start, setStart] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owners usually set up at the ranch, so start where the phone is
  useEffect(() => {
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      const fix = granted ? await locate() : null;
      setStart(fix ? { center: [fix.coords.longitude, fix.coords.latitude], zoom: 16 } : { center: US_CENTER, zoom: 4 });
    })();
  }, []);

  async function save() {
    const center = await map.current?.getCenter();
    if (!center) return;
    setBusy(true);
    setError(null);
    try {
      await setHeadquarters(device, { lng: center[0], lat: center[1] });
      onDone();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `The server had a problem (${e.status}). Try again, or skip and use Sharpen this area later.`
          : "Can't reach the server. Try again with signal, or skip for now.",
      );
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {start && (
        <Map ref={map} androidView="texture" style={StyleSheet.absoluteFill} mapStyle={mapStyleUrl(device)} logo={false} attribution={false}>
          <Camera initialViewState={start} />
        </Map>
      )}

      {/* The tag pin's point is its bottom, so lift it by its own height to put the point on the map's center */}
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={styles.pin}>
          <Logo size={56} />
        </View>
      </View>

      <View style={[styles.card, { top: insets.top + space.md }]}>
        <Text style={styles.title} accessibilityRole="header">WHERE’S HEADQUARTERS?</Text>
        <Text style={styles.text}>Move the map so the pin sits on the house or barns. We’ll get sharp aerial photos for about a mile around it.</Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        {error && (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <AppButton size="large" title={busy ? 'Saving…' : 'This is headquarters'} onPress={save} disabled={busy || !start} />
        <Pressable onPress={onDone} disabled={busy} accessibilityRole="button" style={styles.skip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const PIN_HEIGHT = (56 * 84) / 80;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.pine },
  pinWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { marginBottom: PIN_HEIGHT, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  card: { position: 'absolute', left: space.md, right: space.md, backgroundColor: colors.chrome, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  title: { fontFamily: fonts.displayBlack, fontSize: 30, lineHeight: 32, color: palette.canvas },
  text: { fontSize: 16, lineHeight: 22, color: colors.chromeTextMuted },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xs, backgroundColor: colors.scrim },
  error: { backgroundColor: colors.dangerBackground, borderRadius: radius.md, padding: 12 },
  errorText: { color: palette.destructive, fontSize: 15, fontWeight: '600' },
  skip: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 16, fontWeight: '700', color: palette.canvas },
});
