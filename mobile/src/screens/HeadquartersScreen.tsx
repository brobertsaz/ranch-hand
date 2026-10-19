import { Camera, GeoJSONSource, Layer, Map, type MapRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, estimateAround, setHeadquarters, type SharpenEstimate } from '../api';
import AppButton from '../components/AppButton';
import Logo from '../components/Logo';
import { locate } from '../locate';
import { mapStyleUrl, type Device } from '../settings';
import { colors, fonts, palette, radius, space, touch } from '../theme';

// Middle of the lower 48, for an owner who won't share their location: they zoom in from there
const US_CENTER: [number, number] = [-98.6, 39.8];
// Matches Ranch::HEADQUARTERS_MILES on the server
const MILES = [1, 3, 5] as const;
const METERS_PER_MILE = 1609.344;
const METERS_PER_DEGREE = 111_320;

// The square the server will sharpen, so the owner sees what each size covers
function square([lng, lat]: [number, number], miles: number) {
  const dlat = (miles * METERS_PER_MILE) / 2 / METERS_PER_DEGREE;
  const dlng = dlat / Math.cos((lat * Math.PI) / 180);
  const ring = [[lng - dlng, lat - dlat], [lng + dlng, lat - dlat], [lng + dlng, lat + dlat], [lng - dlng, lat + dlat], [lng - dlng, lat - dlat]];
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: ring } };
}

function describe(estimate: SharpenEstimate) {
  const size = estimate.estimated_megabytes >= 1000 ? `${(estimate.estimated_megabytes / 1000).toFixed(1)} GB` : `${estimate.estimated_megabytes} MB`;
  const hours = estimate.estimated_minutes / 60;
  const time = hours >= 1.5 ? `about ${Math.round(hours)} hours` : estimate.estimated_minutes >= 60 ? 'about an hour' : `about ${estimate.estimated_minutes} min`;
  return `${estimate.source_name} imagery · ${size} to download · ready in ${time}`;
}

// Right after an owner starts a ranch: move the map until the pin sits on the house or barns, and pick how
// much around it to sharpen, so the first look at the ranch isn't blurry. The pin stays in the middle and the
// map moves under it, which is easier with gloves than dragging a small marker.
export default function HeadquartersScreen({ device, onDone }: { device: Device; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const map = useRef<MapRef>(null);
  const [start, setStart] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [miles, setMiles] = useState<number>(3);
  const [estimate, setEstimate] = useState<SharpenEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owners usually set up at the ranch, so start where the phone is, zoomed out enough to see 3 miles
  useEffect(() => {
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      const fix = granted ? await locate() : null;
      const at: [number, number] = fix ? [fix.coords.longitude, fix.coords.latitude] : US_CENTER;
      setStart({ center: at, zoom: fix ? 13 : 4 });
      setCenter(at);
    })();
  }, []);

  // The source and size only change across state lines or with the choice, so a tenth of a degree is close enough
  const estimateKey = center && `${center[0].toFixed(1)},${center[1].toFixed(1)},${miles}`;
  useEffect(() => {
    if (!center) return;
    let current = true;
    estimateAround(device, { lng: center[0], lat: center[1] }, miles)
      .then((next) => current && setEstimate(next))
      .catch(() => current && setEstimate(null));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the rounded spot or the size changes
  }, [estimateKey, device]);

  async function save() {
    const at = await map.current?.getCenter();
    if (!at) return;
    setBusy(true);
    setError(null);
    try {
      await setHeadquarters(device, { lng: at[0], lat: at[1] }, miles);
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
        <Map
          ref={map}
          androidView="texture"
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyleUrl(device)}
          logo={false}
          attribution={false}
          onRegionDidChange={(e) => setCenter([e.nativeEvent.center[0], e.nativeEvent.center[1]])}
        >
          <Camera initialViewState={start} />
          {center && (
            <GeoJSONSource id="hq-square" data={square(center, miles)}>
              <Layer type="line" id="hq-square-line" paint={{ 'line-color': palette.harvest, 'line-width': 3, 'line-dasharray': [2, 1.5] }} />
            </GeoJSONSource>
          )}
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
        <Text style={styles.text}>Move the map so the pin sits on the house or barns. The dashed square gets sharp aerial photos.</Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        <Text style={styles.label} nativeID="miles-label">How much to sharpen</Text>
        <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabelledBy="miles-label">
          {MILES.map((choice) => (
            <Pressable
              key={choice}
              onPress={() => setMiles(choice)}
              accessibilityRole="radio"
              accessibilityState={{ selected: miles === choice }}
              accessibilityLabel={`${choice} ${choice === 1 ? 'mile' : 'miles'} across`}
              style={[styles.choice, miles === choice && styles.choiceOn]}
            >
              <Text style={[styles.choiceText, miles === choice && styles.choiceTextOn]}>{choice} mi</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.estimate}>{estimate ? describe(estimate) : ' '}</Text>

        {error && (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <AppButton size="large" title={busy ? 'Saving…' : 'This is headquarters'} onPress={save} disabled={busy || !start} style={{ marginTop: space.sm }} />
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
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xs, backgroundColor: colors.chrome },
  label: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 2.4, color: palette.harvest, textTransform: 'uppercase' },
  choices: { flexDirection: 'row', gap: 10, marginTop: space.xs },
  choice: {
    flex: 1, minHeight: touch.min, borderRadius: radius.md, borderWidth: 2, borderColor: 'rgba(245, 239, 224, 0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  choiceOn: { backgroundColor: palette.harvest, borderColor: palette.harvest },
  choiceText: { fontFamily: fonts.display, fontSize: 24, color: palette.canvas },
  choiceTextOn: { color: palette.pine },
  estimate: { fontSize: 14, lineHeight: 20, color: colors.chromeTextMuted, minHeight: 20 },
  error: { backgroundColor: colors.dangerBackground, borderRadius: radius.md, padding: 12 },
  errorText: { color: palette.destructive, fontSize: 15, fontWeight: '600' },
  skip: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 16, fontWeight: '700', color: palette.canvas },
});
