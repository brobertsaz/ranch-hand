import {
  Camera,
  Map,
  Marker,
  OfflineManager,
  UserLocation,
  type CameraRef,
  type MapRef,
  type OfflinePackStatus,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { liveObservations, photosFor, type Observation } from '../db';
import { estimateTiles, expandBounds, MIN_PACK_SPAN_KM, PACK_MAX_ZOOM, PACK_MIN_ZOOM, TILE_LIMIT } from '../offline';
import { photoFile } from '../photoFiles';
import { forgetDevice, mapStyleUrl, type Device } from '../settings';
import { useSync } from '../useSync';
import CaptureScreen from './CaptureScreen';

// Roughly Sundance, WY, until the phone has a fix
const START: [number, number] = [-104.376, 44.406];

const KIND_COLORS: Record<string, string> = {
  sick_animal: '#d93025',
  feed_check: '#f2a33a',
  fence_issue: '#7b5cd6',
  other: '#2f7de1',
};

type Props = { device: Device; onSignOut: () => void };

export default function MapScreen({ device, onSignOut }: Props) {
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const syncState = useSync(device);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [selected, setSelected] = useState<{ observation: Observation; photoUris: string[] } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [pack, setPack] = useState<string>('No offline area yet');
  const [downloading, setDownloading] = useState<number | null>(null);

  const reload = useCallback(() => {
    liveObservations().then(setObservations);
  }, []);

  useEffect(() => {
    reload();
    const sub = addDatabaseChangeListener(reload);
    // Open where the phone is; START is only for a phone that has never had a fix
    Location.requestForegroundPermissionsAsync().then(async ({ granted }) => {
      const fix = granted ? await Location.getLastKnownPositionAsync() : null;
      if (fix) camera.current?.jumpTo({ center: [fix.coords.longitude, fix.coords.latitude], zoom: 14 });
    });
    OfflineManager.getPacks().then(async (packs) => {
      const last = packs.at(-1);
      if (last) setPack(describePack(await last.status()));
    });
    return () => sub.remove();
  }, [reload]);

  async function select(observation: Observation) {
    const photos = await photosFor(observation.id);
    const photoUris = photos.map((p) => photoFile(p.id)).filter((f) => f.exists).map((f) => f.uri);
    setSelected({ observation, photoUris });
  }

  async function centerOnMe() {
    const fix = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync());
    camera.current?.flyTo({ center: [fix.coords.longitude, fix.coords.latitude], zoom: 15 });
  }

  async function downloadArea() {
    const visible = await map.current?.getBounds();
    if (!visible) return;
    const bounds = expandBounds(visible);
    const tiles = estimateTiles(bounds);
    if (tiles > TILE_LIMIT) {
      Alert.alert('Area too big', `About ${tiles} tiles. Zoom in until it's under ${TILE_LIMIT}.`);
      return;
    }

    setDownloading(0);
    let finished = false;
    const finish = (title: string, message: string) => {
      if (finished) return;
      finished = true;
      setDownloading(null);
      Alert.alert(title, message);
    };

    try {
      await OfflineManager.createPack(
        {
          mapStyle: mapStyleUrl(device),
          bounds,
          minZoom: PACK_MIN_ZOOM,
          maxZoom: PACK_MAX_ZOOM,
          metadata: { name: `Area ${new Date().toISOString()}`, estimatedTiles: tiles },
        },
        (_pack, status) => {
          setPack(describePack(status));
          setDownloading(status.percentage);
          if (status.state === 'complete') {
            finish('Saved for offline', `At least ${MIN_PACK_SPAN_KM} km across around this view. ${describePack(status)}`);
          }
        },
        (_pack, error) => {
          setPack(`Download failed: ${error.message}`);
          finish('Download failed', error.message);
        },
      );
    } catch (error) {
      finish('Download failed', (error as Error).message);
    }
  }

  async function signOut() {
    await forgetDevice();
    onSignOut();
  }

  return (
    <View style={{ flex: 1 }}>
      <Map ref={map} style={{ flex: 1 }} mapStyle={mapStyleUrl(device)} logo={false}>
        <Camera ref={camera} initialViewState={{ center: START, zoom: 13 }} />
        <UserLocation accuracy />
        {observations.map((o) => (
          <Marker key={o.id} id={o.id} lngLat={[o.longitude, o.latitude]} onPress={() => select(o)}>
            <View style={[styles.pin, { backgroundColor: KIND_COLORS[o.kind] }, o._status !== 'synced' && styles.pinUnsynced]} />
          </Marker>
        ))}
      </Map>

      <SafeAreaView edges={['top']} style={styles.statusBar} pointerEvents="box-none">
        <View style={styles.panel}>
          <Text style={styles.bold}>
            {device.ranchName} · {syncState.online ? 'online' : 'offline'}
            {syncState.syncing ? ' · syncing…' : ''}
          </Text>
          <Text>
            Waiting to sync: {syncState.pending.records} records, {syncState.pending.uploads} photo uploads
          </Text>
          {syncState.lastResult && <Text style={styles.small}>{syncState.lastResult}</Text>}
          <Text style={styles.small}>Offline map: {pack}</Text>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.toolbar}>
        <Button
          title={downloading === null ? 'Download area' : `Downloading ${Math.round(downloading)}%`}
          onPress={downloadArea}
          disabled={downloading !== null}
        />
        <Button title="Me" onPress={centerOnMe} />
        <Button title="Sync" onPress={syncState.syncNow} disabled={syncState.syncing} />
        <Pressable style={styles.addButton} onPress={() => setCapturing(true)} accessibilityLabel="New observation">
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </SafeAreaView>

      <Modal visible={capturing} animationType="slide" onRequestClose={() => setCapturing(false)}>
        <CaptureScreen
          memberId={device.memberId}
          onDone={(saved) => {
            setCapturing(false);
            if (saved) {
              centerOnMe();
              syncState.syncNow();
            }
          }}
        />
      </Modal>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          {selected && (
            <View style={styles.card}>
              {selected.photoUris.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} />
              ))}
              <Text style={styles.bold}>{selected.observation.kind.replace('_', ' ')}</Text>
              {selected.observation.tag_number && <Text>Tag {selected.observation.tag_number}</Text>}
              {selected.observation.note && <Text>{selected.observation.note}</Text>}
              <Text style={styles.small}>
                {new Date(selected.observation.observed_at).toLocaleString()} · ±{Math.round(selected.observation.accuracy ?? 0)} m ·{' '}
                {selected.observation._status}
              </Text>
            </View>
          )}
        </Pressable>
      </Modal>

      <Pressable onLongPress={signOut} style={styles.signOut}>
        <Text style={styles.small}>hold to leave ranch</Text>
      </Pressable>
    </View>
  );
}

function describePack(status: OfflinePackStatus): string {
  const mb = (status.completedTileSize / 1_000_000).toFixed(1);
  return `${status.state} ${Math.round(status.percentage)}% · ${status.completedTileCount} tiles · ${mb} MB`;
}

const styles = StyleSheet.create({
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  panel: { margin: 8, padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.92)', gap: 2 },
  toolbar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', paddingTop: 8,
  },
  addButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2f7de1', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  addText: { color: 'white', fontSize: 32, lineHeight: 36 },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'white' },
  pinUnsynced: { borderColor: '#222', borderStyle: 'dashed' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 14, gap: 6 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 6 },
  bold: { fontWeight: '600' },
  small: { fontSize: 12, color: '#444' },
  signOut: { position: 'absolute', right: 8, bottom: 110, opacity: 0.5 },
});
