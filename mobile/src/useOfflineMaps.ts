import { OfflineManager, type MapRef, type OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Alert } from 'react-native';

import { errorText, estimateSharpening, fetchMapAreas, removeMapArea, sharpenArea, type MapArea } from './api';
import { getState, setState } from './db';
import { lineString } from './geojson';
import { estimateTiles, expandBounds, MIN_PACK_SPAN_KM, PACK_MAX_ZOOM, PACK_MIN_ZOOM, TILE_LIMIT, VIEW_USGS_LIMIT } from './offline';
import { mapStyleUrl, type Device } from './settings';

// The ranch's sharp areas as last fetched, so area downloads and estimates work with no signal
const AREAS_KEY = 'map_areas';

type Options = {
  device: Device;
  // The map on screen: downloads and sharpening work on whatever it's showing
  map: RefObject<MapRef | null>;
  // The Map sheet is up, which is where each area's render progress shows
  sheetOpen: boolean;
  online: boolean;
  // An area turned Ready, or was re-rendered, so the style the map loaded is out of date
  onReadyAreasChanged: () => void;
};

// The ranch's sharp areas and what's saved on this phone for no signal: the list, the downloads, and
// asking the server to sharpen or remove an area
export function useOfflineMaps({ device, map, sheetOpen, online, onReadyAreasChanged }: Options) {
  const [pack, setPack] = useState<string>('No offline area yet');
  const readyKey = useRef<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  // What's downloading ('view' or a sharp area's id), so the progress shows on the button that was tapped
  const [downloadTarget, setDownloadTarget] = useState<string | null>(null);
  // Sharp areas already saved on this phone, by savedKey, read back from the offline packs.
  // The key includes when the area was rendered, so an area redone since (new imagery) shows as not saved.
  const [savedAreas, setSavedAreas] = useState<Set<string>>(new Set());
  const [areas, setAreas] = useState<MapArea[]>([]);
  const [sharpening, setSharpening] = useState(false);

  useEffect(() => {
    getState(AREAS_KEY).then((saved) => {
      if (!saved) return;
      const list = JSON.parse(saved) as MapArea[];
      // The map is loading the style for these same areas, so this isn't a change that needs a reload
      readyKey.current = readyKeyOf(list);
      setAreas(list);
    });
    OfflineManager.setTileCountLimit(TILE_LIMIT);
    OfflineManager.getPacks().then(async (packs) => {
      const last = packs.at(-1);
      if (last) setPack(describePack(await last.status()));
      setSavedAreas(new Set(packs.map((p) => p.metadata?.savedKey).filter((key): key is string => typeof key === 'string')));
    });
  }, []);

  const refreshAreas = useCallback(
    () =>
      fetchMapAreas(device)
        .then((list) => {
          setAreas(list);
          setState(AREAS_KEY, JSON.stringify(list));
        })
        .catch(() => {}), // no signal: keep the saved list
    [device],
  );

  // Once when the map opens, since the owner may have just added areas on the headquarters screen
  useEffect(() => {
    refreshAreas();
  }, [refreshAreas]);

  // The sheet shows each area's render progress, so refetch when it opens and every few seconds while one is rendering
  const rendering = areas.some((a) => a.status === 'pending' || a.status === 'rendering');
  useEffect(() => {
    if (!sheetOpen) return;
    const refresh = refreshAreas;
    refresh();
    if (!rendering) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [sheetOpen, refreshAreas, rendering]);

  // An area that turned Ready, or was re-rendered, isn't in the style the map loaded, so reload it
  useEffect(() => {
    const key = readyKeyOf(areas);
    const previous = readyKey.current;
    readyKey.current = key;
    if (previous === null || previous === key) return;
    onReadyAreasChanged();
  }, [areas, onReadyAreasChanged]);

  const sharpBoxes = areas.filter((a) => a.status === 'ready').map((a) => ({ box: areaBounds(a), maxZoom: a.max_zoom ?? 18 }));

  async function downloadArea() {
    const visibleBounds = await map.current?.getBounds();
    if (!visibleBounds) return;
    const bounds = expandBounds(visibleBounds);
    const tiles = estimateTiles(bounds, sharpBoxes);
    if (tiles.usgs > VIEW_USGS_LIMIT) {
      Alert.alert('Area too big', `About ${tiles.usgs} tiles. Zoom in until it's under ${VIEW_USGS_LIMIT}.`);
      return;
    }
    savePack(bounds, tiles.total, `At least ${MIN_PACK_SPAN_KM} km across around this view.`);
  }

  function downloadSharpArea(area: MapArea) {
    const bounds = areaBounds(area);
    const maxZoom = area.max_zoom ?? 18;
    savePack(bounds, estimateTiles(bounds, [{ box: bounds, maxZoom }]).total, `${area.name}, sharp to zoom ${maxZoom}.`, area);
  }

  // Asks first, since a big view can take a while to render
  async function sharpenView() {
    const visibleBounds = await map.current?.getBounds();
    if (!visibleBounds) return;
    let estimate;
    try {
      estimate = await estimateSharpening(device, visibleBounds);
    } catch (error) {
      Alert.alert("Couldn't sharpen", online ? errorText(error) : 'This needs a signal. Try again at the house.');
      return;
    }
    Alert.alert(
      'Sharpen this area?',
      `${estimate.source_name} imagery, close up to zoom ${estimate.max_zoom}. It takes about ${estimate.estimated_minutes} min. When it says Ready here, download it to have it with no signal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sharpen', onPress: () => startSharpen(visibleBounds) },
      ],
    );
  }

  async function startSharpen(visibleBounds: [number, number, number, number]) {
    setSharpening(true);
    try {
      const area = await sharpenArea(device, visibleBounds);
      setAreas((list) => [...list, area]);
    } catch (error) {
      Alert.alert("Couldn't sharpen", online ? errorText(error) : 'This needs a signal. Try again at the house.');
    } finally {
      setSharpening(false);
    }
  }

  function confirmRemoveArea(area: MapArea) {
    const busy = area.status === 'pending' || area.status === 'rendering';
    Alert.alert(busy ? `Stop sharpening ${area.name}?` : `Remove ${area.name}?`, busy ? 'It stops now and leaves the list.' : 'It leaves the list. Maps you already downloaded stay on this phone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: busy ? 'Stop' : 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMapArea(device, area.id);
            setAreas((list) => list.filter((a) => a.id !== area.id));
          } catch (error) {
            Alert.alert("Couldn't remove it", online ? errorText(error) : 'This needs a signal. Try again at the house.');
          }
        },
      },
    ]);
  }

  async function savePack(bounds: [number, number, number, number], tiles: number, saved: string, area?: MapArea) {
    const key = area ? savedKey(area) : undefined;
    setDownloading(0);
    setDownloadTarget(area?.id ?? 'view');
    let finished = false;
    const finish = (title: string, message: string, newPackId: string | null = null) => {
      if (finished) return;
      finished = true;
      setDownloading(null);
      setDownloadTarget(null);
      if (newPackId && area && key) {
        dropOlderPacks(area, newPackId);
        setSavedAreas((keys) => new Set([...keys].filter((k) => !k.startsWith(`${area.id}@`))).add(key));
      }
      Alert.alert(title, message);
    };

    try {
      await OfflineManager.createPack(
        {
          mapStyle: mapStyleUrl(device),
          bounds,
          minZoom: PACK_MIN_ZOOM,
          maxZoom: PACK_MAX_ZOOM,
          metadata: { name: `Area ${new Date().toISOString()}`, estimatedTiles: tiles, ...(key ? { savedKey: key } : {}) },
        },
        (pack, status) => {
          setPack(describePack(status));
          setDownloading(status.percentage);
          if (status.state === 'complete') {
            finish('Saved for offline', `${saved} ${describePack(status)}`, pack.id);
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

  return { areas, pack, downloading, downloadTarget, savedAreas, sharpening, downloadArea, downloadSharpArea, sharpenView, confirmRemoveArea };
}

export type OfflineMaps = ReturnType<typeof useOfflineMaps>;

// "Update" on a sharp area downloads a whole new pack. Once it's in, the area's older packs only take up space.
// Only after the new one finishes, so a failed update never leaves the area with no map.
async function dropOlderPacks(area: MapArea, keepPackId: string) {
  try {
    const packs = await OfflineManager.getPacks();
    for (const old of packs) {
      const oldKey = old.metadata?.savedKey;
      if (old.id !== keepPackId && typeof oldKey === 'string' && oldKey.startsWith(`${area.id}@`)) await OfflineManager.deletePack(old.id);
    }
  } catch {
    // The old pack stays; it's wasted space, not a broken map
  }
}

// Packs are keyed by the style URL, which carries this ranch's map key, so after leaving they aren't this
// phone's to use. Best effort: a pack that won't delete is wasted space, not a reason to stay signed in.
export async function deleteOfflinePacks(): Promise<void> {
  try {
    for (const old of await OfflineManager.getPacks()) await OfflineManager.deletePack(old.id).catch(() => {});
  } catch {
    // nothing to do
  }
}

export function areaOutlines(areas: MapArea[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: areas.map(({ west, south, east, north }) =>
      lineString([[west, south], [east, south], [east, north], [west, north], [west, south]]),
    ),
  };
}

function readyKeyOf(areas: MapArea[]): string {
  return areas.filter((a) => a.status === 'ready').map(savedKey).sort().join(',');
}

export function savedKey(area: MapArea): string {
  return `${area.id}@${area.rendered_at}`;
}

export function areaBounds(area: MapArea): [number, number, number, number] {
  return [area.west, area.south, area.east, area.north];
}

export function describeArea(area: MapArea): string {
  if (area.status === 'ready') return `Ready · ${area.source_name ?? 'NAIP'} · ${area.tile_count} tiles`;
  if (area.status === 'failed') return 'Failed. Tap Sharpen this area to try again.';
  if (area.status === 'rendering') return `Sharpening · ${area.tile_count} of ${area.estimated_tiles} tiles`;
  return `Waiting to start · about ${area.estimated_tiles} tiles`;
}

function describePack(status: OfflinePackStatus): string {
  const mb = (status.completedTileSize / 1_000_000).toFixed(1);
  return `${status.state} ${Math.round(status.percentage)}% · ${status.completedTileCount} tiles · ${mb} MB`;
}
