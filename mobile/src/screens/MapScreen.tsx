import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon, { type IconName } from '../components/Icon';
import Chip from '../components/Chip';
import LayersSheet from '../components/LayersSheet';
import { PEEK_HEIGHT, PeekCard, PlacePeekCard } from '../components/PeekCard';
import Pin from '../components/Pin';
import SyncPill from '../components/SyncPill';
import FollowSheet from '../components/FollowSheet';
import LocationDot from '../components/LocationDot';
import HelpScreen from './HelpScreen';
import NameRideSheet from '../components/NameRideSheet';
import PlaceSheet, { type PlaceFields } from '../components/PlaceSheet';
import RideSheet, { ModePill } from '../components/RideSheet';
import TabBar, { useTabBarHeight, type Tab } from '../components/TabBar';
import { clearRanchData, createWaypoint, getState, KINDS, onDatabaseChange, updateWaypoint, liveObservations, liveRides, liveWaypoints, observationsAt, photosFor, setState, type Kind, type Observation, type Ride, type Waypoint } from '../db';
import { dayAndTime, distanceMeters, formatDistance, formatDuration, type LngLat } from '../format';
import { endPoint, lineString } from '../geojson';
import { useIsOwner, useMemberNames, who } from '../members';
import { crewNews, isNew, newsSeenAt } from '../news';
import { KIND_INFO, nextPlaceName, WAYPOINT_INFO } from '../kinds';
import { GPS_ONLY_OK, locate, type Located } from '../locate';
import { deleteAccount, errorText, leaveCrew, type MapArea } from '../api';
import { deleteAllPhotos, photoFile } from '../photoFiles';
import { unregisterFromPush, usePush } from '../push';
import { fetchPhoto, stopSync } from '../sync';
import { cumulative, placesOnTrail } from '../trail';
import { forgetDevice, mapStyleUrl, type Device } from '../settings';
import { colors, fonts, isDark, palette, radius, shadow, space, touch } from '../theme';
import { areaBounds, areaOutlines, deleteOfflinePacks, useOfflineMaps } from '../useOfflineMaps';
import { useRideState } from '../useRideState';
import { signedOutText, useSync } from '../useSync';
import CaptureScreen, { type CaptureHandle } from './CaptureScreen';
import ObservationScreen from './ObservationScreen';
import CrewScreen from './CrewScreen';
import SettingsScreen from './SettingsScreen';
import NewsScreen from './NewsScreen';
import RidesScreen from './RidesScreen';
import WaypointScreen from './WaypointScreen';

const BASE_KEY = 'map_base';
// Pins closer than this overlap on screen at field zoom levels
const ALSO_HERE_METERS = 30;

// Roughly Sundance, WY, until the phone has a fix
const START: [number, number] = [-104.376, 44.406];

type Props = { device: Device; onSignOut: () => void };

// Mockup 1 · Ranch map, plus the tab bar that hosts the other screens
export default function MapScreen({ device, onSignOut }: Props) {
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const syncState = useSync(device);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  // The ride sheet or follow sheet, whichever is up, sits where the tab bar was
  const [sheetHeight, setSheetHeight] = useState(0);
  const names = useMemberNames();
  // Only the owner can remove a sharp area (the server agrees)
  const isOwner = useIsOwner(device.memberId);
  // Unread count for the New tab
  const [newsCount, setNewsCount] = useState(0);
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  // The filter button's list of kinds, open or closed
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pickFilter = (next: Kind | 'all') => {
    setFilter(next);
    setFiltersOpen(false);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  // A stack, so Back from a check opened inside a place returns to the place. Ids name either kind of record.
  const [details, setDetails] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('map');
  const [capturing, setCapturing] = useState(false);
  const capture = useRef<CaptureHandle>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeLayers = useCallback(() => setLayersOpen(false), []);
  // Aerial photos, or USGS Topo (contours, creeks, section lines). Both are in every offline download.
  const [base, setBase] = useState<'aerial' | 'topo'>('aerial');
  // Where the map opens: the phone's last fix, or START for a phone that has never had one
  const [start, setStart] = useState<[number, number] | null>(null);
  // MapLibre reads the style (which lists the ready sharp areas) once, when the map mounts. Bumping mapKey remounts
  // the map so an area that turned Ready shows up, and `view` puts the camera back where it was.
  const [mapKey, setMapKey] = useState(0);
  const [view, setView] = useState<{ center: [number, number]; zoom: number } | null>(null);
  // MapLibre on iOS only applies initialViewState at the map's first layout. Our camera mounts after that (it waits
  // for `start`), so there the map would open on the whole world. Once the map has loaded, put the camera where it
  // belongs by hand. This holds the mapKey that has loaded.
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !start || loadedKey !== mapKey) return;
    camera.current?.jumpTo(view ?? { center: start, zoom: 14 });
  }, [start, view, loadedKey, mapKey]);
  const [here, setHere] = useState<LngLat | null>(null);
  // Putting a place under the crosshair: a new one, or an existing one being moved
  const [placing, setPlacing] = useState<{ move: Waypoint | null } | null>(null);
  // The add-a-place sheet. A place from GPS waits for its fix; one set on the map already has its spot.
  // stale: the spot is the phone's last known position, not a fresh fix.
  const [adding, setAdding] = useState<{ at: LngLat | null; accuracy: number | null; fromMap: boolean; noFix?: boolean; stale?: boolean } | null>(null);
  // Kind, name and note picked before switching to the map, restored when the sheet comes back
  const [draft, setDraft] = useState<PlaceFields | null>(null);
  // A tap on a pin also reaches the map underneath; without this the map's tap clears the pin just selected
  const pinPressedAt = useRef(0);
  // Counts selections, so a slow photo lookup for one pin can't land on the card of the pin tapped after it
  const selection = useRef(0);

  const rideState = useRideState(device.memberId, rides);
  const { ride, liveTrack, shownRide, followRide, followTrack, naming } = rideState;

  const reload = useCallback(() => {
    liveObservations().then(setObservations);
    liveWaypoints().then(setWaypoints);
    liveRides().then(setRides);
    Promise.all([crewNews(device.memberId), newsSeenAt()]).then(([items, seenAt]) => setNewsCount(items.filter((i) => isNew(i, seenAt)).length));
  }, [device.memberId]);

  useEffect(() => {
    reload();
    // Only the tables the map draws, gathered up: a first sync or a ride's GPS points would otherwise
    // reload every pin once per row
    const sub = onDatabaseChange(['observations', 'waypoints', 'rides'], reload);
    // No fix (location off, or a phone that never had one): open on the newest pin so the crew's work is in view
    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => (granted ? Location.getLastKnownPositionAsync() : null))
      .catch(() => null)
      .then(async (fix) => {
        if (fix) {
          setHere([fix.coords.longitude, fix.coords.latitude]);
          return setStart([fix.coords.longitude, fix.coords.latitude]);
        }
        const [newest] = await liveObservations();
        setStart(newest ? [newest.longitude, newest.latitude] : START);
      });
    getState(BASE_KEY).then((saved) => saved === 'topo' && setBase('topo'));
    return () => sub.remove();
  }, [reload]);

  // MapLibre only reads the style when the map mounts, so remount it where it was
  const reloadStyle = useCallback(async () => {
    const [center, zoom] = await Promise.all([map.current?.getCenter(), map.current?.getZoom()]);
    if (center && zoom !== undefined) setView({ center: center as [number, number], zoom });
    setMapKey((k) => k + 1);
  }, []);
  const offline = useOfflineMaps({ device, map, sheetOpen: layersOpen, online: syncState.online, onReadyAreasChanged: reloadStyle });

  const placeIds = useMemo(() => new Set(waypoints.map((w) => w.id)), [waypoints]);
  // A check made at a place shows through the place's pin, not a pin of its own
  const sightings = useMemo(
    // Resolved sightings leave the map so it doesn't fill up with old news; they stay in place histories
    () =>
      observations.filter(
        (o) => o.status !== 'resolved' && !(o.waypoint_id && placeIds.has(o.waypoint_id)) && (filter === 'all' || o.kind === filter),
      ),
    [observations, placeIds, filter],
  );
  const places = useMemo(() => (filter === 'all' ? waypoints : waypoints.filter((w) => WAYPOINT_INFO[w.kind].kind === filter)), [waypoints, filter]);
  // observations come newest first, so the first one seen for a place is its current status
  const latestAt = useMemo(() => {
    const latest: Record<string, Observation> = {};
    for (const o of observations) if (o.waypoint_id && !latest[o.waypoint_id]) latest[o.waypoint_id] = o;
    return latest;
  }, [observations]);
  const selected = observations.find((o) => o.id === selectedId) ?? null;
  const selectedPlace = waypoints.find((w) => w.id === selectedId) ?? null;
  const detailId = details.at(-1) ?? null;
  const detail = observations.find((o) => o.id === detailId) ?? null;
  const detailPlace = waypoints.find((w) => w.id === detailId) ?? null;
  // Pins on the same spot cover each other, so the card offers the others as buttons
  const alsoHere = useMemo((): { id: string; label: string; color: string; place?: Waypoint; sighting?: Observation }[] => {
    const at: LngLat | null = selected ? [selected.longitude, selected.latitude] : selectedPlace ? [selectedPlace.longitude, selectedPlace.latitude] : null;
    if (!at) return [];
    const near = (lng: number, lat: number) => distanceMeters(at, [lng, lat]) <= ALSO_HERE_METERS;
    return [
      ...places.filter((w) => w.id !== selectedId && near(w.longitude, w.latitude)).map((w) => ({ id: w.id, label: w.name, color: WAYPOINT_INFO[w.kind].color, place: w })),
      ...sightings
        .filter((o) => o.id !== selectedId && near(o.longitude, o.latitude))
        .map((o) => ({
          id: o.id,
          label: o.tag_number ? `Tag ${o.tag_number}` : (o.note ?? KIND_INFO[o.kind].label),
          color: KIND_INFO[o.kind].pinColor,
          sighting: o,
        })),
    ];
  }, [selected, selectedPlace, selectedId, places, sightings]);
  const openDetail = (id: string) => setDetails((stack) => [...stack, id]);
  usePush(device, {
    onNews: syncState.syncNow,
    // A tap on "Sick animal · Tag 1147 · Jess": bring it down, then open it. With no signal it isn't on this
    // phone yet, and the map is the honest place to land.
    onOpen: async (observationId) => {
      await syncState.syncNow();
      setTab('map');
      if ((await liveObservations()).some((o) => o.id === observationId)) openDetail(observationId);
    },
  });
  const closeDetail = () => setDetails((stack) => stack.slice(0, -1));

  // While a pin's card or its detail screen is up, keep `here` live so "0.3 mi NE of you" stays true as they ride
  const watchingHere = !!selectedId || !!detailId;
  useEffect(() => {
    if (!watchingHere) return;
    let gone = false;
    let sub: Location.LocationSubscription | undefined;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10, ...GPS_ONLY_OK }, (fix) =>
      setHere([fix.coords.longitude, fix.coords.latitude]),
    )
      .then((s) => (gone ? s.remove() : (sub = s)))
      .catch(() => {});
    return () => {
      gone = true;
      sub?.remove();
    };
  }, [watchingHere]);
  const openCount = observations.filter((o) => o.status === 'open').length;
  // resolved_at is stamped on the phone that resolved it, so this matches across the crew
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const resolvedCount = observations.filter((o) => o.status === 'resolved' && (o.resolved_at ?? 0) >= weekAgo).length;
  // While riding or following, a sheet takes the tab bar's place on the map
  const riding = !!ride && tab === 'map';
  const following = !riding && !!followRide && tab === 'map';
  const bottomInset = riding || following ? sheetHeight : tabBarHeight;
  const pinsDropped = ride ? observations.filter((o) => o.member_id === device.memberId && o.observed_at >= ride.startedAt).length : 0;
  // Still to go up. A record the server turned down isn't waiting; Settings lists those.
  const unsynced = observations.filter((o) => o._status !== 'synced' && o._status !== 'rejected').length;
  // "To Creek gate", "Water 1 to Creek gate": the places the ride went past, first and last
  const nameSuggestions = useMemo(() => {
    if (!naming) return [];
    const passed = placesOnTrail(naming.track, cumulative(naming.track), waypoints).map((p) => p.waypoint.name);
    const first = passed[0];
    const last = passed.at(-1);
    return [last && `To ${last}`, first && last && first !== last && `${first} to ${last}`].filter((x): x is string => !!x);
  }, [naming, waypoints]);

  async function select(id: string, photoFrom: string[]) {
    pinPressedAt.current = Date.now();
    const mine = ++selection.current;
    setSelectedId(id);
    setSelectedPhoto(null);
    Location.getLastKnownPositionAsync()
      .then((fix) => fix && setHere([fix.coords.longitude, fix.coords.latitude]))
      .catch(() => {});
    for (const observationId of photoFrom) {
      const file = (await photosFor(observationId)).map((p) => photoFile(p.id)).find((f) => f.exists);
      if (selection.current !== mine) return;
      if (file) return setSelectedPhoto(file.uri);
    }
  }

  const selectSighting = (o: Observation) => select(o.id, [o.id]);
  // A place shows the newest photo taken there. Selected first, so the card is up while its checks are read.
  const selectPlace = async (w: Waypoint) => {
    const pending = select(w.id, []);
    const mine = selection.current;
    await pending;
    const checks = await observationsAt(w.id);
    if (selection.current !== mine) return;
    for (const check of checks) {
      const file = (await photosFor(check.id)).map((p) => photoFile(p.id)).find((f) => f.exists);
      if (selection.current !== mine) return;
      if (file) return setSelectedPhoto(file.uri);
    }
  };

  function showRide(rideId: string) {
    const ride = rides.find((r) => r.id === rideId);
    rideState.show(rideId);
    setSelectedId(null);
    setTab('map');
    if (ride) fitTrack(JSON.parse(ride.track) as LngLat[]);
  }

  function fitTrack(track: LngLat[]) {
    if (track.length === 0) return;
    const lngs = track.map((p) => p[0]);
    const lats = track.map((p) => p[1]);
    // A short ride would zoom past the imagery (it stops at z16), so show at least ~500 m around it
    const pad = (min: number, max: number, span: number) => {
      const extra = Math.max(0, (span - (max - min)) / 2);
      return [min - extra, max + extra];
    };
    const [west, east] = pad(Math.min(...lngs), Math.max(...lngs), 0.006);
    const [south, north] = pad(Math.min(...lats), Math.max(...lats), 0.0045);
    camera.current?.fitBounds([west, south, east, north], {
      padding: { top: 220, right: 60, bottom: 260, left: 60 },
      duration: 600,
    });
  }

  function showArea(area: MapArea) {
    setLayersOpen(false);
    camera.current?.fitBounds(areaBounds(area), { padding: { top: 220, right: 40, bottom: 200, left: 40 }, duration: 600 });
  }

  function rideTitle(r: Ride): string {
    return r.name ?? (r.member_id === device.memberId ? 'Your ride' : `${who(names, r.member_id, device.memberId)}'s ride`);
  }

  function beginRide() {
    return rideState.begin(() => {
      setSelectedId(null);
      setTab('map');
      centerOnMe();
    });
  }

  function endRide() {
    return rideState.end((track) => {
      syncState.syncNow();
      fitTrack(track);
    });
  }

  function startFollowing(rideId: string) {
    rideState.follow(rideId);
    rideState.show(null);
    setSelectedId(null);
    setTab('map');
    centerOnMe();
  }

  const saveRideName = (name: string) => rideState.saveName(name, syncState.syncNow);

  async function centerOnMe() {
    try {
      const fix = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync(GPS_ONLY_OK));
      setHere([fix.coords.longitude, fix.coords.latitude]);
      camera.current?.flyTo({ center: [fix.coords.longitude, fix.coords.latitude], zoom: 15 });
    } catch {
      Alert.alert('No location yet', 'Turn on Location for Ranch Hand, or step into the open for a GPS fix.');
    }
  }

  // Standing at the gate: drop it right here, no camera, no check
  function addPlaceHere() {
    setSelectedId(null);
    setDraft(null);
    setAdding({ at: null, accuracy: null, fromMap: false });
    locate()
      .catch(() => null)
      .then((found: Located | null) =>
        setAdding((current) => {
          if (!current || current.fromMap) return current;
          if (!found) return { ...current, noFix: true };
          return { ...current, at: [found.fix.coords.longitude, found.fix.coords.latitude], accuracy: found.fix.coords.accuracy, stale: found.stale };
        }),
      );
  }

  function startPlacing(at: LngLat | null, move: Waypoint | null) {
    if (!move && !adding) setDraft(null);
    setSelectedId(null);
    setDetails([]);
    setAdding(null);
    setTab('map');
    // Close enough to put a gate on the right side of the fence
    if (at) camera.current?.flyTo({ center: at, zoom: 17 });
    setPlacing({ move });
  }

  async function confirmPlacing() {
    const center = await map.current?.getCenter();
    if (!center || !placing) return;
    const at: LngLat = [center[0], center[1]];
    setPlacing(null);
    if (!placing.move) return setAdding({ at, accuracy: null, fromMap: true });
    try {
      await updateWaypoint(placing.move.id, { longitude: at[0], latitude: at[1] });
    } catch {
      return Alert.alert("Couldn't move it", `The phone had trouble saving. ${placing.move.name} is where it was.`);
    }
    syncState.syncNow();
    selectPlace(placing.move);
  }

  async function savePlace(fields: PlaceFields) {
    if (!adding?.at) return;
    let id: string;
    try {
      id = await createWaypoint({ ...fields, longitude: adding.at[0], latitude: adding.at[1] }, device.memberId);
    } catch {
      // The sheet stays up with what was typed
      return Alert.alert("Couldn't save the place", 'The phone had trouble saving it. Try again.');
    }
    setAdding(null);
    setDraft(null);
    // So the new pin isn't hidden behind a filter
    setFilter('all');
    syncState.syncNow();
    select(id, []);
  }

  function describeAdding(): string {
    if (!adding) return '';
    if (adding.fromMap) return 'Where you set it on the map.';
    if (adding.at && adding.stale) return `No fresh GPS fix. This is the phone's last known spot, ±${Math.round(adding.accuracy ?? 0)} m. Check it on the map.`;
    if (adding.at) return `Where you're standing · ±${Math.round(adding.accuracy ?? 0)} m`;
    return adding.noFix ? 'No GPS fix. Set it on the map instead.' : 'Getting a GPS fix…';
  }

  function chooseBase(next: 'aerial' | 'topo') {
    setBase(next);
    setState(BASE_KEY, next);
  }

  // What leaving throws away, in the confirm, so nobody loses work without being told
  function lostOnLeaving(): string {
    const { records, uploads } = syncState.pending;
    const turnedDown = syncState.problems.length;
    const parts = [
      records > 0 && `${records} record${records === 1 ? '' : 's'}`,
      uploads > 0 && `${uploads} photo${uploads === 1 ? '' : 's'}`,
      turnedDown > 0 && `${turnedDown} the server turned down`,
    ].filter(Boolean);
    return parts.length > 0 ? ` Not synced yet, and lost if you go ahead: ${parts.join(', ')}.` : '';
  }

  function confirmSignOut() {
    if (ride) {
      Alert.alert('Stop your ride first', 'Hold Stop on the map, then leave the ranch.');
      return;
    }
    // Leaving tells the server, which frees the hand's spot. With no signal it can't, and they should know.
    const offline = syncState.online || syncState.signedOut ? '' : " There's no signal, so the crew list keeps showing you until the owner removes you.";
    Alert.alert(
      'Leave this ranch?',
      `This clears the ranch's pins, places, rides and offline maps from this phone. Join again with an invite code to get them back.${offline}${lostOnLeaving()}`,
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: leave },
      ],
    );
  }

  async function leave() {
    setSettingsOpen(false);
    try {
      // First, so a sync in flight can't write the old ranch back into the tables once they're cleared
      await stopSync(device);
      // Best effort: with no signal, or for an owner (the server keeps a ranch's owner), the phone still leaves
      // An owner can't leave on the server, so their phone has to say for itself that it's done with the news
      if (syncState.online && !syncState.signedOut) await unregisterFromPush(device);
      if (syncState.online && !syncState.signedOut) await leaveCrew(device).catch(() => {});
      await clearThisPhone();
    } catch {
      Alert.alert("Couldn't leave", 'The phone had trouble clearing the ranch. Close Ranch Hand, open it again, and try once more.');
    }
  }

  // The sign-in, the ranch's records, photos and offline maps all go, and the app is back at the setup screen
  async function clearThisPhone() {
    await forgetDevice();
    await clearRanchData();
    deleteAllPhotos();
    await deleteOfflinePacks();
    onSignOut();
  }

  // Settings has already asked twice. The server goes first: if it says no (or can't be reached), nothing
  // on this phone changes, sync included.
  async function deleteMyAccount() {
    try {
      await deleteAccount(device);
    } catch (error) {
      Alert.alert("Couldn't delete your account", `${errorText(error)} Nothing was deleted. Try again when you have a signal.`);
      return;
    }
    setSettingsOpen(false);
    try {
      await stopSync(device);
      await clearThisPhone();
    } catch {
      Alert.alert('Your account is deleted', "The phone had trouble clearing the ranch's data. Close Ranch Hand and open it again.");
    }
  }

  // The server stopped accepting this phone. Said once when it happens; the sync pill and Settings keep saying it.
  function explainSignedOut() {
    if (!syncState.signedOut) return;
    if (ride) {
      Alert.alert(signedOutText(syncState.signedOut, device.ranchName), 'Your ride is still recording on this phone. Hold Stop to finish it before joining again.');
      return;
    }
    // A bare 401 also happens when the owner deleted the whole ranch, so don't promise it's still there
    const how = syncState.signedOut === 'removed' ? 'Ask the owner for an invite code to join again.' : 'The ranch may be gone, or this phone may have been signed out. Join again with an invite code.';
    Alert.alert(
      signedOutText(syncState.signedOut, device.ranchName),
      `What's on this phone stays, but nothing syncs with the crew any more. ${how} Joining again clears this phone first.${lostOnLeaving()}`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Clear and join again', style: 'destructive', onPress: leave },
      ],
    );
  }
  const signedOut = syncState.signedOut;
  useEffect(() => {
    if (signedOut) explainSignedOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once each time the phone turns out to be signed out
  }, [signedOut]);

  // The pill's tap: sync, unless there's something to read first
  function onSyncPill() {
    if (syncState.signedOut) return explainSignedOut();
    if (syncState.online && syncState.error) {
      return Alert.alert('Sync failed', `${syncState.error} What you've logged is safe on this phone.`, [
        { text: 'Close', style: 'cancel' },
        { text: 'Try again', onPress: syncState.syncNow },
      ]);
    }
    if (syncState.problems.length > 0 && syncState.pending.records + syncState.pending.uploads === 0) return setSettingsOpen(true);
    syncState.syncNow();
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Map key={mapKey} ref={map} androidView="texture" style={StyleSheet.absoluteFill} mapStyle={mapStyleUrl(device)} logo={false}
        onDidFinishLoadingMap={() => setLoadedKey(mapKey)}
        onPress={() => {
          setFiltersOpen(false);
          if (Date.now() - pinPressedAt.current > 500) setSelectedId(null);
        }}
        onLongPress={(e) => !placing && startPlacing([e.nativeEvent.lngLat[0], e.nativeEvent.lngLat[1]], null)}
      >
        {start && <Camera ref={camera} initialViewState={view ?? { center: start, zoom: 14 }} trackUserLocation={following ? 'default' : undefined} />}
        {/* Above the sharp areas too, which the style ends with aerial-top */}
        {base === 'topo' && <Layer type="raster" id="topo" source="topo" afterId="aerial-top" paint={TOPO_PAINT} />}
        {/* An earthy wash over the base map, so it reads as ranch ground in the app's palette, not a stock street map */}
        <GeoJSONSource id="wash" data={WORLD}>
          <Layer type="fill" id="wash" afterId={base === 'topo' ? 'topo' : 'aerial-top'} paint={base === 'topo' ? TOPO_WASH : AERIAL_WASH} />
        </GeoJSONSource>
        {/* Where each sharp area is: a faint dashed outline, with its name on the top edge */}
        <GeoJSONSource id="sharp-areas" data={areaOutlines(offline.areas)}>
          <Layer type="line" id="sharp-areas-line" paint={{ 'line-color': palette.canvas, 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [3, 2] }} />
        </GeoJSONSource>
        {offline.areas.map((area) => (
          <Marker key={`area:${area.id}`} id={`area:${area.id}`} lngLat={[(area.west + area.east) / 2, area.north]} anchor="center" onPress={() => showArea(area)}>
            <View style={styles.areaLabel} accessibilityLabel={`${area.name} sharp area`}>
              <Text style={styles.areaLabelText} numberOfLines={1}>{area.name}</Text>
            </View>
          </Marker>
        ))}
        <LocationDot />
        {shownRide && (
          <GeoJSONSource id="shown-ride" data={lineString(JSON.parse(shownRide.track) as LngLat[])}>
            <Layer type="line" id="shown-ride-line" paint={{ 'line-color': palette.sky, 'line-width': 5, 'line-opacity': 0.9 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
        {following && followTrack.length >= 2 && (
          <GeoJSONSource id="follow-ride" data={lineString(followTrack)}>
            <Layer type="line" id="follow-ride-casing" paint={{ 'line-color': palette.white, 'line-width': 10, 'line-opacity': 0.85 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer type="line" id="follow-ride-line" paint={{ 'line-color': palette.sky, 'line-width': 6 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
        {following && followTrack.length >= 2 && (
          // Start in canvas, end in sky, so the direction is plain
          <GeoJSONSource id="follow-ride-ends" data={{ type: 'FeatureCollection', features: [endPoint(followTrack[0], 'start'), endPoint(followTrack[followTrack.length - 1], 'end')] }}>
            <Layer
              type="circle"
              id="follow-ride-end-dots"
              paint={{ 'circle-radius': 8, 'circle-color': ['match', ['get', 'end'], 'start', palette.canvas, palette.sky], 'circle-stroke-color': palette.pine, 'circle-stroke-width': 3 }}
            />
          </GeoJSONSource>
        )}
        {liveTrack.length >= 2 && (
          <GeoJSONSource id="live-ride" data={lineString(liveTrack)}>
            <Layer type="line" id="live-ride-casing" paint={{ 'line-color': palette.pine, 'line-width': 9, 'line-opacity': 0.35 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer type="line" id="live-ride-line" paint={{ 'line-color': palette.focus, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
        {liveTrack.length >= 1 && (
          // Where the ride started
          <GeoJSONSource id="live-ride-start" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: liveTrack[0] } }}>
            <Layer type="circle" id="live-ride-start-dot" paint={{ 'circle-radius': 7, 'circle-color': palette.canvas, 'circle-stroke-color': palette.pine, 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        )}
        {places.map((w) => {
          const info = WAYPOINT_INFO[w.kind];
          const on = w.id === selectedId;
          return (
            // Keyed on sync status and selection too: the native marker doesn't redraw when only its children change
            <Marker key={`${w.id}:${w._status}:${on}:${latestAt[w.id]?.status}`} id={w.id} lngLat={[w.longitude, w.latitude]} anchor={on ? 'bottom' : 'center'} onPress={() => selectPlace(w)}>
              <Pin
                color={info.color}
                onColor={info.onColor}
                icon={info.icon}
                synced={w._status === 'synced'}
                selected={on}
                square
                alert={latestAt[w.id]?.status === 'open'}
              />
            </Marker>
          );
        })}
        {sightings.map((o) => {
          const info = KIND_INFO[o.kind];
          const on = o.id === selectedId;
          return (
            <Marker key={`${o.id}:${o._status}:${on}`} id={o.id} lngLat={[o.longitude, o.latitude]} anchor={on ? 'bottom' : 'center'} onPress={() => selectSighting(o)}>
              <Pin color={info.pinColor} onColor={info.onColor} icon={info.icon} synced={o._status === 'synced'} selected={on} />
            </Marker>
          );
        })}
      </Map>

      {riding || following ? (
        <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="none">
          {riding ? <ModePill label="RECORDING RIDE" /> : <ModePill label="FOLLOWING A RIDE" color={palette.creek} />}
        </View>
      ) : (
        <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.ranch} numberOfLines={1} accessibilityRole="header">{device.ranchName}</Text>
              <Text style={styles.counts}>
                {openCount} open · {resolvedCount} resolved this week
              </Text>
            </View>
            <SyncPill state={syncState} unsynced={unsynced} onPress={onSyncPill} />
          </View>
        </View>
      )}

      <View style={[styles.controls, { top: insets.top + (riding || following ? 8 : 92) }]}>
        {/* One button instead of a row across the map; while a filter is on it wears that kind's icon */}
        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={filter === 'all' ? 'Filter the map' : `Showing ${KIND_INFO[filter].label} only. Change filter`}
          accessibilityState={{ expanded: filtersOpen }}
          style={[styles.control, filtersOpen && styles.controlOpen]}
        >
          {filter === 'all' ? (
            <Icon name="filter" size={22} color={filtersOpen ? palette.pine : colors.chromeText} />
          ) : (
            <View style={[styles.filterIcon, { backgroundColor: KIND_INFO[filter].pinColor }]}>
              <Icon name={KIND_INFO[filter].icon} size={17} color={KIND_INFO[filter].onColor} strokeWidth={2.4} />
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => setLayersOpen(true)} accessibilityRole="button" accessibilityLabel="Map layers and offline areas" style={styles.control}>
          <Icon name="layers" size={22} color={colors.chromeText} />
        </Pressable>
        <Pressable onPress={centerOnMe} accessibilityRole="button" accessibilityLabel="Center on me" style={styles.control}>
          <Icon name="locate" size={22} color={colors.chromeText} />
        </Pressable>
        {!placing && (
          <Pressable onPress={addPlaceHere} accessibilityRole="button" accessibilityLabel="Add a place where you're standing" style={styles.control}>
            <Icon name="pin" size={22} color={colors.chromeText} />
            <View style={styles.controlBadge}>
              <Icon name="plus" size={12} color={palette.white} strokeWidth={3} />
            </View>
          </Pressable>
        )}
      </View>

      {filtersOpen && !riding && !following && (
        <View style={[styles.filterMenu, { top: insets.top + 92 }]} accessibilityRole="radiogroup" accessibilityLabel="Show on the map">
          <FilterOption label="Everything" icon="all" color={palette.canvas} onColor={palette.pine} on={filter === 'all'} onPress={() => pickFilter('all')} />
          {KINDS.map((k) => (
            <FilterOption
              key={k}
              label={KIND_INFO[k].label}
              icon={KIND_INFO[k].icon}
              color={KIND_INFO[k].pinColor}
              onColor={KIND_INFO[k].onColor}
              on={filter === k}
              onPress={() => pickFilter(k)}
            />
          ))}
        </View>
      )}

      {placing && (
        <>
          {/* The map's center is the screen's center; the place goes under the cross */}
          <View style={styles.crosshair} pointerEvents="none">
            {/* White on a dark outline, so it shows on pale grass and dark timber alike */}
            <View>
              <Icon name="plus" size={56} color={palette.pine} strokeWidth={5} />
              <View style={StyleSheet.absoluteFill}>
                <Icon name="plus" size={56} color={palette.white} strokeWidth={2.5} />
              </View>
            </View>
          </View>
          <View style={[styles.placingBar, { paddingBottom: insets.bottom + space.lg }]}>
            <Text style={styles.placingTitle}>{placing.move ? `Move ${placing.move.name}` : 'Add a place'}</Text>
            <Text style={styles.placingHint}>Drag the map until the cross sits on it.</Text>
            <View style={styles.placingActions}>
              <AppButton variant="chrome" title="Cancel" onPress={() => setPlacing(null)} style={styles.flex} />
              <AppButton title={placing.move ? 'Move it here' : 'Put it here'} onPress={confirmPlacing} style={styles.flex} />
            </View>
          </View>
        </>
      )}

      {selected && tab === 'map' && !placing && (
        <PeekCard
          observation={selected}
          photoUri={selectedPhoto}
          author={who(names, selected.member_id, device.memberId)}
          claimedBy={selected.status === 'open' && selected.claimed_by_id ? who(names, selected.claimed_by_id, device.memberId) : null}
          here={here}
          bottom={bottomInset + 20}
          onPress={() => openDetail(selected.id)}
        />
      )}
      {(selected || selectedPlace) && tab === 'map' && !placing && alsoHere.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.alsoHere, { bottom: bottomInset + 20 + PEEK_HEIGHT + space.sm }]}
          contentContainerStyle={styles.chips}
        >
          <Text style={styles.alsoHereLabel}>Also here</Text>
          {alsoHere.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              color={item.color}
              on={false}
              onPress={() => (item.place ? selectPlace(item.place) : item.sighting && selectSighting(item.sighting))}
            />
          ))}
        </ScrollView>
      )}
      {selectedPlace && tab === 'map' && !placing && (
        <PlacePeekCard
          waypoint={selectedPlace}
          latest={latestAt[selectedPlace.id] ?? null}
          photoUri={selectedPhoto}
          author={latestAt[selectedPlace.id] ? who(names, latestAt[selectedPlace.id].member_id, device.memberId) : ''}
          here={here}
          bottom={bottomInset + 20}
          onPress={() => openDetail(selectedPlace.id)}
        />
      )}

      {shownRide && tab === 'map' && !placing && !riding && !following && !selected && !selectedPlace && (
        <View style={[styles.rideCard, { bottom: bottomInset + 20 }]}>
          <View style={styles.rideCardText}>
            <Text style={styles.rideCardTitle} numberOfLines={2}>{rideTitle(shownRide)}</Text>
            <Text style={styles.rideCardSmall}>
              {shownRide.name ? `${who(names, shownRide.member_id, device.memberId)} · ` : ''}
              {dayAndTime(shownRide.started_at)} · {formatDistance(shownRide.distance_meters)} · {formatDuration(shownRide.ended_at - shownRide.started_at)}
            </Text>
            <View style={styles.rideCardActions}>
              <AppButton
                title="Follow this ride"
                onPress={() => startFollowing(shownRide.id)}
                icon={<Icon name="navigate" size={20} color={palette.white} strokeWidth={2.4} />}
              />
              {shownRide.member_id === device.memberId && (
                <AppButton
                  variant="ghost"
                  title={shownRide.name ? 'Rename' : 'Name it'}
                  onPress={() => rideState.setNaming({ id: shownRide.id, track: JSON.parse(shownRide.track) as LngLat[], name: shownRide.name ?? '' })}
                />
              )}
            </View>
          </View>
          <Pressable onPress={() => rideState.show(null)} accessibilityRole="button" accessibilityLabel="Hide this ride" style={styles.rideCardClose}>
            <Icon name="close" size={20} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}

      {tab === 'rides' && (
        <RidesScreen memberId={device.memberId} riding={!!ride} onStart={beginRide} onBackToRide={() => setTab('map')} onShowRide={showRide} />
      )}
      {tab === 'new' && (
        <NewsScreen memberId={device.memberId} ranchName={device.ranchName} sync={syncState} onOpenObservation={openDetail} onShowRide={showRide} />
      )}
      {tab === 'crew' && <CrewScreen device={device} onOpenSettings={() => setSettingsOpen(true)} />}

      {riding && ride && !placing && (
        <RideSheet
          ride={ride}
          track={liveTrack}
          pinsDropped={pinsDropped}
          onLog={() => setCapturing(true)}
          onStop={endRide}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        />
      )}
      {following && followRide && !placing && (
        <FollowSheet
          title={rideTitle(followRide)}
          track={followTrack}
          waypoints={waypoints}
          onStop={() => rideState.follow(null)}
          onLog={() => setCapturing(true)}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        />
      )}
      {!riding && !following && !placing && (
        <TabBar
          active={tab}
          onChange={(next) => {
            setTab(next);
            // Opening New marks it read, so the badge clears
            if (next === 'new') setNewsCount(0);
          }}
          onCapture={() => setCapturing(true)}
          badges={{ new: tab === 'new' ? 0 : newsCount }}
        />
      )}

      {/* Android's back button goes through the screen's own cancel, so a photo already taken isn't orphaned or lost without asking */}
      <Modal visible={capturing} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => capture.current?.requestClose()}>
        <SafeAreaProvider>
          <CaptureScreen
            ref={capture}
            memberId={device.memberId}
            onDone={(saved) => {
              setCapturing(false);
              if (saved) {
                setTab('map');
                centerOnMe();
                syncState.syncNow();
              }
            }}
          />
        </SafeAreaProvider>
      </Modal>

      <Modal visible={!!detail || !!detailPlace} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={closeDetail}>
        <SafeAreaProvider>
          {detail && (
            <ObservationScreen
              observation={detail}
              placeName={detail.waypoint_id ? (waypoints.find((w) => w.id === detail.waypoint_id)?.name ?? null) : null}
              memberId={device.memberId}
              mapStyle={mapStyleUrl(device)}
              here={here}
              fetchPhoto={(photoId) => fetchPhoto(device, photoId)}
              canDelete={isOwner || detail.member_id === device.memberId}
              onOpenObservation={openDetail}
              onBack={closeDetail}
              onChanged={syncState.syncNow}
            />
          )}
          {detailPlace && (
            <WaypointScreen
              waypoint={detailPlace}
              memberId={device.memberId}
              mapStyle={mapStyleUrl(device)}
              here={here}
              onBack={closeDetail}
              onOpenObservation={(o) => openDetail(o.id)}
              onMoveOnMap={(w) => startPlacing([w.longitude, w.latitude], w)}
              onChanged={syncState.syncNow}
            />
          )}
        </SafeAreaProvider>
      </Modal>

      <PlaceSheet
        visible={!!adding}
        title="Add a place"
        initial={draft ?? { kind: 'gate', name: nextPlaceName(waypoints, 'gate'), note: null }}
        autoName={(kind) => nextPlaceName(waypoints, kind)}
        where={describeAdding()}
        canSave={!!adding?.at}
        extra={
          adding && !adding.fromMap
            ? {
                title: 'Set it on the map instead',
                onPress: (fields) => {
                  setDraft(fields);
                  startPlacing(adding.at ?? here, null);
                },
              }
            : undefined
        }
        onSave={savePlace}
        onCancel={() => setAdding(null)}
      />

      <NameRideSheet
        visible={!!naming}
        initialName={naming?.name ?? ''}
        suggestions={nameSuggestions}
        onSave={saveRideName}
        onSkip={() => rideState.setNaming(null)}
      />

      <Modal visible={settingsOpen} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSettingsOpen(false)}>
        <SettingsScreen
          ranchName={device.ranchName}
          sync={syncState}
          onHelp={() => setHelpOpen(true)}
          onLeave={confirmSignOut}
          onSignedOut={explainSignedOut}
          isOwner={isOwner}
          riding={!!ride}
          unsynced={lostOnLeaving()}
          onDeleteAccount={deleteMyAccount}
          onClose={() => setSettingsOpen(false)}
        />
      </Modal>

      <Modal visible={helpOpen} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setHelpOpen(false)}>
        <HelpScreen onClose={() => setHelpOpen(false)} />
      </Modal>

      <LayersSheet visible={layersOpen} onClose={closeLayers} base={base} onBase={chooseBase} offline={offline} isOwner={isOwner} onShowArea={showArea} />
    </View>
  );
}

// One kind in the filter menu: its pin icon in its color, so the menu doubles as the map's legend
function FilterOption({ label, icon, color, onColor, on, onPress }: { label: string; icon: IconName; color: string; onColor: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.filterOption, on && styles.filterOptionOn]}>
      <View style={[styles.filterIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={17} color={onColor} strokeWidth={2.4} />
      </View>
      <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>{label}</Text>
    </Pressable>
  );
}

// Covers the whole map for the wash layer
const WORLD = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } };
// Topo is white and blue out of the box; pull it toward canvas and leather
// Night Ride dims Topo to a low parchment so it doesn't glare at 5 AM
const TOPO_PAINT = isDark
  ? { 'raster-saturation': -0.5, 'raster-contrast': -0.1, 'raster-brightness-max': 0.55 }
  : { 'raster-saturation': -0.35, 'raster-contrast': -0.08, 'raster-brightness-max': 0.93 };
const TOPO_WASH = { 'fill-color': isDark ? palette.pine : palette.leather, 'fill-opacity': isDark ? 0.25 : 0.16 };
// Aerial just gets warmer and a touch darker, like late-afternoon light, so white pins and labels pop
const AERIAL_WASH = { 'fill-color': isDark ? palette.pine : '#4A3418', 'fill-opacity': isDark ? 0.3 : 0.14 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.chrome },
  top: { position: 'absolute', left: 12, right: 12, gap: 10 },
  header: {
    ...shadow, backgroundColor: colors.chrome, borderRadius: radius.lg, paddingVertical: 12, paddingLeft: 16, paddingRight: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  headerText: { flex: 1, gap: 1 },
  ranch: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.chromeText },
  counts: { fontSize: 13, color: colors.chromeTextMuted },
  chips: { gap: space.sm },
  controls: { position: 'absolute', right: 12, gap: space.sm },
  controlBadge: {
    position: 'absolute', right: 8, bottom: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  crosshair: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  placingBar: {
    ...shadow, position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.chrome,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: space.lg, paddingHorizontal: space.lg, gap: 6,
  },
  placingTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.chromeText },
  placingHint: { fontSize: 15, color: colors.chromeTextMuted },
  placingActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  flex: { flex: 1 },
  controlOpen: { backgroundColor: palette.canvas },
  filterMenu: { ...shadow, position: 'absolute', right: 12 + touch.min + space.sm, width: 200, backgroundColor: colors.chrome, borderRadius: 16, padding: 6, gap: 2 },
  filterOption: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 12 },
  filterOptionOn: { backgroundColor: palette.canvas },
  filterIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  filterLabel: { color: colors.chromeText, fontSize: 17, fontWeight: '700' },
  filterLabelOn: { color: palette.pine, fontWeight: '800' },
  control: { width: touch.min, height: touch.min, borderRadius: 14, backgroundColor: colors.chrome, alignItems: 'center', justifyContent: 'center' },
  alsoHere: { position: 'absolute', left: 12, right: 12 },
  alsoHereLabel: { alignSelf: 'center', color: palette.white, fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowRadius: 4 },
  rideCardTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 25, color: colors.text },
  rideCardSmall: { fontSize: 13, color: colors.textMuted },
  rideCard: {
    ...shadow, position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 16,
    paddingVertical: 12, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  rideCardText: { flex: 1, gap: 2 },
  rideCardActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6 },
  rideCardClose: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  areaLabel: { backgroundColor: 'rgba(16, 23, 19, 0.82)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 180 },
  areaLabelText: { color: palette.canvas, fontSize: 13, fontWeight: '700' },
});
