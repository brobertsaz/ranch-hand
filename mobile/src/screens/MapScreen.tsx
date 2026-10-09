import {
  Camera,
  GeoJSONSource,
  Layer,
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
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import Pin from '../components/Pin';
import FollowSheet from '../components/FollowSheet';
import NameRideSheet from '../components/NameRideSheet';
import RideSheet, { ModePill } from '../components/RideSheet';
import TabBar, { useTabBarHeight, type Tab } from '../components/TabBar';
import { clearRanchData, getState, KINDS, liveObservations, liveRides, liveWaypoints, observationsAt, photosFor, renameRide, setState, type Kind, type Observation, type Ride, type Waypoint } from '../db';
import { dayAndTime, distanceMeters, formatDistance, formatDuration, relativeTo, timeAgo, type LngLat } from '../format';
import { useMemberNames, who } from '../members';
import { crewNews, isNew, newsSeenAt } from '../news';
import { activeRide, resumeRideIfNeeded, ridePoints, startRide, stopRide, type ActiveRide } from '../rides';
import { KIND_INFO, WAYPOINT_INFO } from '../kinds';
import { estimateTiles, expandBounds, MIN_PACK_SPAN_KM, PACK_MAX_ZOOM, PACK_MIN_ZOOM, TILE_LIMIT } from '../offline';
import { deleteAllPhotos, photoFile } from '../photoFiles';
import { cumulative, placesOnTrail } from '../trail';
import { forgetDevice, mapStyleUrl, type Device } from '../settings';
import { colors, fonts, palette, radius, space, sync, touch } from '../theme';
import { useSync, type SyncState } from '../useSync';
import CaptureScreen from './CaptureScreen';
import ObservationScreen from './ObservationScreen';
import CrewScreen from './CrewScreen';
import NewsScreen from './NewsScreen';
import RidesScreen from './RidesScreen';
import WaypointScreen from './WaypointScreen';

const BASE_KEY = 'map_base';
// Pins closer than this overlap on screen at field zoom levels
const ALSO_HERE_METERS = 30;
// 72 photo + 2 × 10 padding
const PEEK_HEIGHT = 92;

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
  // The ride picked from the Rides tab, drawn on the map until closed
  const [shownRideId, setShownRideId] = useState<string | null>(null);
  // The ride in progress and its track, re-read every few seconds
  const [ride, setRide] = useState<ActiveRide | null>(null);
  const [liveTrack, setLiveTrack] = useState<LngLat[]>([]);
  // The ride sheet or follow sheet, whichever is up, sits where the tab bar was
  const [sheetHeight, setSheetHeight] = useState(0);
  // A saved ride someone is following, track and all
  const [followRideId, setFollowRideId] = useState<string | null>(null);
  // The ride being named: right after it stops, or from its card
  const [naming, setNaming] = useState<{ id: string; track: LngLat[]; name: string } | null>(null);
  const names = useMemberNames();
  // Unread count for the New tab
  const [newsCount, setNewsCount] = useState(0);
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  // A stack, so Back from a check opened inside a place returns to the place. Ids name either kind of record.
  const [details, setDetails] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('map');
  const [capturing, setCapturing] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  // Aerial photos, or USGS Topo (contours, creeks, section lines). Both are in every offline download.
  const [base, setBase] = useState<'aerial' | 'topo'>('aerial');
  const [pack, setPack] = useState<string>('No offline area yet');
  // Where the map opens: the phone's last fix, or START for a phone that has never had one
  const [start, setStart] = useState<[number, number] | null>(null);
  const [here, setHere] = useState<LngLat | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  // A tap on a pin also reaches the map underneath; without this the map's tap clears the pin just selected
  const pinPressedAt = useRef(0);

  const reload = useCallback(() => {
    liveObservations().then(setObservations);
    liveWaypoints().then(setWaypoints);
    liveRides().then(setRides);
    Promise.all([crewNews(device.memberId), newsSeenAt()]).then(([items, seenAt]) => setNewsCount(items.filter((i) => isNew(i, seenAt)).length));
  }, [device.memberId]);

  useEffect(() => {
    const refresh = async () => {
      const active = await activeRide();
      setRide(active);
      setLiveTrack(active ? await ridePoints(active.id) : []);
    };
    resumeRideIfNeeded().catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    reload();
    const sub = addDatabaseChangeListener(reload);
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
    OfflineManager.getPacks().then(async (packs) => {
      const last = packs.at(-1);
      if (last) setPack(describePack(await last.status()));
    });
    return () => sub.remove();
  }, [reload]);

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
  const alsoHere = useMemo((): { id: string; label: string; color: string; select: () => void }[] => {
    const at: LngLat | null = selected ? [selected.longitude, selected.latitude] : selectedPlace ? [selectedPlace.longitude, selectedPlace.latitude] : null;
    if (!at) return [];
    const near = (lng: number, lat: number) => distanceMeters(at, [lng, lat]) <= ALSO_HERE_METERS;
    return [
      ...places.filter((w) => w.id !== selectedId && near(w.longitude, w.latitude)).map((w) => ({ id: w.id, label: w.name, color: WAYPOINT_INFO[w.kind].color, select: () => selectPlace(w) })),
      ...sightings
        .filter((o) => o.id !== selectedId && near(o.longitude, o.latitude))
        .map((o) => ({
          id: o.id,
          label: o.tag_number ? `Tag ${o.tag_number}` : (o.note ?? KIND_INFO[o.kind].label),
          color: KIND_INFO[o.kind].pinColor,
          select: () => selectSighting(o),
        })),
    ];
  }, [selected, selectedPlace, selectedId, places, sightings]);
  const openDetail = (id: string) => setDetails((stack) => [...stack, id]);
  const closeDetail = () => setDetails((stack) => stack.slice(0, -1));
  const openCount = observations.filter((o) => o.status === 'open').length;
  // resolved_at is stamped on the phone that resolved it, so this matches across the crew
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const resolvedCount = observations.filter((o) => o.status === 'resolved' && (o.resolved_at ?? 0) >= weekAgo).length;
  const shownRide = rides.find((r) => r.id === shownRideId) ?? null;
  const followRide = rides.find((r) => r.id === followRideId) ?? null;
  const followTrack = useMemo(() => (followRide ? (JSON.parse(followRide.track) as LngLat[]) : []), [followRide]);
  // While riding or following, a sheet takes the tab bar's place on the map
  const riding = !!ride && tab === 'map';
  const following = !riding && !!followRide && tab === 'map';
  const bottomInset = riding || following ? sheetHeight : tabBarHeight;
  const pinsDropped = ride ? observations.filter((o) => o.member_id === device.memberId && o.observed_at >= ride.startedAt).length : 0;
  const unsynced = observations.filter((o) => o._status !== 'synced').length;
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
    setSelectedId(id);
    setSelectedPhoto(null);
    Location.getLastKnownPositionAsync()
      .then((fix) => fix && setHere([fix.coords.longitude, fix.coords.latitude]))
      .catch(() => {});
    for (const observationId of photoFrom) {
      const file = (await photosFor(observationId)).map((p) => photoFile(p.id)).find((f) => f.exists);
      if (file) return setSelectedPhoto(file.uri);
    }
  }

  const selectSighting = (o: Observation) => select(o.id, [o.id]);
  // A place shows the newest photo taken there
  const selectPlace = async (w: Waypoint) => select(w.id, (await observationsAt(w.id)).map((o) => o.id));

  function showRide(rideId: string) {
    const ride = rides.find((r) => r.id === rideId);
    setShownRideId(rideId);
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

  function rideTitle(r: Ride): string {
    return r.name ?? (r.member_id === device.memberId ? 'Your ride' : `${who(names, r.member_id, device.memberId)}'s ride`);
  }

  async function beginRide() {
    try {
      const started = await startRide();
      setRide(started);
      setLiveTrack([]);
      setShownRideId(null);
      setSelectedId(null);
      setTab('map');
      centerOnMe();
    } catch (error) {
      Alert.alert("Couldn't start the ride", (error as Error).message);
    }
  }

  async function endRide() {
    const track = liveTrack;
    const saved = await stopRide(device.memberId);
    setRide(null);
    setLiveTrack([]);
    if (!saved) {
      Alert.alert('Nothing to save', "The phone didn't get enough GPS fixes to draw a track.");
      return;
    }
    syncState.syncNow();
    // Leave the finished ride on the map, with its card, and offer to name it
    setShownRideId(saved.id);
    fitTrack(track);
    setNaming({ id: saved.id, track, name: '' });
  }

  function startFollowing(rideId: string) {
    setFollowRideId(rideId);
    setShownRideId(null);
    setSelectedId(null);
    setTab('map');
    centerOnMe();
  }

  async function saveRideName(name: string) {
    if (naming) await renameRide(naming.id, name);
    setNaming(null);
    syncState.syncNow();
  }

  async function centerOnMe() {
    try {
      const fix = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync());
      setHere([fix.coords.longitude, fix.coords.latitude]);
      camera.current?.flyTo({ center: [fix.coords.longitude, fix.coords.latitude], zoom: 15 });
    } catch {
      Alert.alert('No location yet', 'Turn on Location for Ranch Hand, or step into the open for a GPS fix.');
    }
  }

  async function downloadArea() {
    const visibleBounds = await map.current?.getBounds();
    if (!visibleBounds) return;
    const bounds = expandBounds(visibleBounds);
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

  function chooseBase(next: 'aerial' | 'topo') {
    setBase(next);
    setState(BASE_KEY, next);
  }

  function confirmSignOut() {
    if (ride) {
      Alert.alert('Stop your ride first', 'Hold Stop on the map, then leave the ranch.');
      return;
    }
    const waiting = syncState.pending.records + syncState.pending.uploads;
    const warning = waiting > 0 ? ` ${waiting} of your changes haven't synced yet and will be lost.` : '';
    Alert.alert('Leave this ranch?', `This clears the ranch's pins, places and rides from this phone. Join again to get them back.${warning}`, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLayersOpen(false);
          await forgetDevice();
          await clearRanchData();
          deleteAllPhotos();
          onSignOut();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Map ref={map} style={StyleSheet.absoluteFill} mapStyle={mapStyleUrl(device)} logo={false} onPress={() => Date.now() - pinPressedAt.current > 500 && setSelectedId(null)}>
        {start && <Camera ref={camera} initialViewState={{ center: start, zoom: 14 }} trackUserLocation={following ? 'default' : undefined} />}
        {base === 'topo' && <Layer type="raster" id="topo" source="topo" afterId="imagery" />}
        <UserLocation accuracy />
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
            <SyncPill state={syncState} unsynced={unsynced} onPress={syncState.syncNow} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={[styles.chips, styles.filterChips]}>
            <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
            {KINDS.map((k) => (
              <Chip key={k} label={KIND_INFO[k].short} color={KIND_INFO[k].pinColor} on={filter === k} onPress={() => setFilter(k)} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.controls, { top: insets.top + (riding || following ? 8 : 164) }]}>
        <Pressable onPress={() => setLayersOpen(true)} accessibilityRole="button" accessibilityLabel="Map layers and offline areas" style={styles.control}>
          <Icon name="layers" size={22} color={colors.chromeText} />
        </Pressable>
        <Pressable onPress={centerOnMe} accessibilityRole="button" accessibilityLabel="Center on me" style={styles.control}>
          <Icon name="locate" size={22} color={colors.chromeText} />
        </Pressable>
      </View>

      {selected && tab === 'map' && (
        <PeekCard
          observation={selected}
          photoUri={selectedPhoto}
          author={who(names, selected.member_id, device.memberId)}
          here={here}
          bottom={bottomInset + 20}
          onPress={() => openDetail(selected.id)}
        />
      )}
      {(selected || selectedPlace) && tab === 'map' && alsoHere.length > 0 && (
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
              onPress={item.select}
            />
          ))}
        </ScrollView>
      )}
      {selectedPlace && tab === 'map' && (
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

      {shownRide && tab === 'map' && !riding && !following && !selected && !selectedPlace && (
        <View style={[styles.rideCard, { bottom: bottomInset + 20 }]}>
          <View style={styles.rideCardText}>
            <Text style={styles.peekTitle} numberOfLines={2}>{rideTitle(shownRide)}</Text>
            <Text style={styles.peekSmall}>
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
                  onPress={() => setNaming({ id: shownRide.id, track: JSON.parse(shownRide.track) as LngLat[], name: shownRide.name ?? '' })}
                />
              )}
            </View>
          </View>
          <Pressable onPress={() => setShownRideId(null)} accessibilityRole="button" accessibilityLabel="Hide this ride" style={styles.rideCardClose}>
            <Icon name="close" size={20} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}

      {tab === 'rides' && (
        <RidesScreen memberId={device.memberId} riding={!!ride} onStart={beginRide} onBackToRide={() => setTab('map')} onShowRide={showRide} />
      )}
      {tab === 'new' && (
        <NewsScreen memberId={device.memberId} sync={syncState} onOpenObservation={openDetail} onShowRide={showRide} />
      )}
      {tab === 'crew' && <CrewScreen device={device} />}

      {riding && ride && (
        <RideSheet
          ride={ride}
          track={liveTrack}
          pinsDropped={pinsDropped}
          onLog={() => setCapturing(true)}
          onStop={endRide}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        />
      )}
      {following && followRide && (
        <FollowSheet
          title={rideTitle(followRide)}
          track={followTrack}
          waypoints={waypoints}
          onStop={() => setFollowRideId(null)}
          onLog={() => setCapturing(true)}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        />
      )}
      {!riding && !following && (
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

      <Modal visible={capturing} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCapturing(false)}>
        <SafeAreaProvider>
          <CaptureScreen
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
            />
          )}
        </SafeAreaProvider>
      </Modal>

      <NameRideSheet
        visible={!!naming}
        initialName={naming?.name ?? ''}
        suggestions={nameSuggestions}
        onSave={saveRideName}
        onSkip={() => setNaming(null)}
      />

      <Modal visible={layersOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setLayersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setLayersOpen(false)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]} onPress={() => {}}>
            <Text style={styles.sheetTitle} accessibilityRole="header">Map</Text>
            <View style={styles.baseRow}>
              {(['aerial', 'topo'] as const).map((b) => (
                <Pressable
                  key={b}
                  onPress={() => chooseBase(b)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: base === b }}
                  style={[styles.baseChoice, base === b && styles.baseChoiceOn]}
                >
                  <Icon name={b === 'aerial' ? 'map' : 'layers'} size={22} color={base === b ? palette.white : colors.text} />
                  <Text style={[styles.baseText, base === b && styles.baseTextOn]}>{b === 'aerial' ? 'Aerial' : 'Topo'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetHint}>
              {base === 'topo' ? 'Contour lines, creeks, draws and section lines.' : 'Aerial photos of the ground.'} Offline areas saved before today need saving again to have Topo.
            </Text>

            <View style={styles.sheetDivider} />
            <Text style={styles.sheetTitle}>Offline map</Text>
            <Text style={styles.sheetText}>{pack}</Text>
            <AppButton
              title={downloading === null ? 'Download this area' : `Downloading ${Math.round(downloading)}%`}
              onPress={downloadArea}
              disabled={downloading !== null}
              icon={<Icon name="download" size={20} color={palette.white} strokeWidth={2.4} />}
            />
            <Text style={styles.sheetHint}>Saves aerial and topo maps at least {MIN_PACK_SPAN_KM} km across around the current view.</Text>

            <View style={styles.sheetDivider} />
            <Text style={styles.sheetTitle}>Sync</Text>
            <Text style={styles.sheetText}>
              {syncState.online ? 'Online' : 'No signal'} · {syncState.pending.records} records and {syncState.pending.uploads} photos waiting
            </Text>
            {syncState.lastResult && <Text style={styles.sheetHint}>Last run {syncState.lastResult}</Text>}
            <AppButton
              variant="secondary"
              title={syncState.syncing ? 'Syncing…' : 'Sync now'}
              onPress={syncState.syncNow}
              disabled={syncState.syncing}
              icon={<Icon name="refresh" size={20} color={palette.white} />}
            />

            <View style={styles.sheetDivider} />
            <AppButton variant="ghost" title="Leave this ranch" onPress={confirmSignOut} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SyncPill({ state, unsynced, onPress }: { state: SyncState; unsynced: number; onPress: () => void }) {
  const photos = state.pending.uploads;
  const pill = state.syncing
    ? { icon: 'refresh' as const, color: colors.chromeText, label: 'Syncing…', warn: false }
    : unsynced > 0
      ? { icon: 'cloudOff' as const, color: palette.harvest, label: `${unsynced} waiting`, warn: true }
      : photos > 0
        ? { icon: 'cloudOff' as const, color: palette.harvest, label: `${photos} photo${photos === 1 ? '' : 's'} waiting`, warn: true }
        : !state.online
          ? { icon: 'cloudOff' as const, color: palette.harvest, label: 'Offline', warn: true }
          : { icon: 'check' as const, color: sync.synced, label: 'Synced', warn: false };

  return (
    <Pressable
      onPress={onPress}
      disabled={state.syncing}
      accessibilityRole="button"
      accessibilityLabel={`${pill.label}. Sync now`}
      style={[styles.syncPill, pill.warn && styles.syncPillWarn]}
    >
      <Icon name={pill.icon} size={18} color={pill.color} strokeWidth={2.2} />
      <Text style={styles.syncPillText}>{pill.label}</Text>
    </Pressable>
  );
}

function Chip({ label, color, on, onPress }: { label: string; color?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      {color && <View style={[styles.chipDot, { backgroundColor: color }]} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

type PeekProps = { observation: Observation; photoUri: string | null; author: string; here: LngLat | null; bottom: number; onPress: () => void };

function PeekCard({ observation, photoUri, author, here, bottom, onPress }: PeekProps) {
  const info = KIND_INFO[observation.kind];
  const title = [observation.tag_number && `Tag ${observation.tag_number}`, observation.note].filter(Boolean).join(' · ') || info.label;
  const where = here ? relativeTo(here, [observation.longitude, observation.latitude]) : `±${Math.round(observation.accuracy ?? 0)} m`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens the observation" style={[styles.peek, { bottom }]}>
      <View style={styles.peekPhoto}>
        {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} /> : <Icon name={info.icon} size={28} color={colors.chromeTextMuted} />}
      </View>
      <View style={styles.peekText}>
        <View style={styles.peekMeta}>
          <Text style={[styles.peekBadge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.short.toUpperCase()}</Text>
          <Text style={styles.peekSmall}>
            {timeAgo(observation.observed_at)} · {author}
          </Text>
        </View>
        <Text style={styles.peekTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.peekSmall}>
          {where}
          {observation._status !== 'synced' ? ' · on this phone' : ''}
        </Text>
      </View>
      <Icon name="chevronRight" size={22} color={colors.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

type PlacePeekProps = {
  waypoint: Waypoint;
  latest: Observation | null;
  photoUri: string | null;
  author: string;
  here: LngLat | null;
  bottom: number;
  onPress: () => void;
};

function PlacePeekCard({ waypoint, latest, photoUri, author, here, bottom, onPress }: PlacePeekProps) {
  const info = WAYPOINT_INFO[waypoint.kind];
  const where = here ? relativeTo(here, [waypoint.longitude, waypoint.latitude]) : 'Fixed place';
  const status = latest
    ? [latest.note ?? 'Checked', latest.status === 'resolved' && 'resolved', timeAgo(latest.observed_at), author]
        .filter(Boolean)
        .join(' · ')
    : 'No checks yet';

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens the place" style={[styles.peek, { bottom }]}>
      <View style={[styles.peekPhoto, styles.peekPlace]}>
        {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} /> : <Icon name={info.icon} size={28} color={colors.chromeTextMuted} />}
      </View>
      <View style={styles.peekText}>
        <View style={styles.peekMeta}>
          <Text style={[styles.peekBadge, { backgroundColor: info.badgeColor, color: info.onColor }]}>{info.label.toUpperCase()}</Text>
          <Text style={styles.peekSmall}>{where}</Text>
        </View>
        <Text style={styles.peekTitle} numberOfLines={1}>{waypoint.name}</Text>
        <Text style={styles.peekSmall} numberOfLines={1}>{status}</Text>
      </View>
      <Icon name="chevronRight" size={22} color={colors.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

function lineString(coordinates: LngLat[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
}

function endPoint(coordinates: LngLat, end: 'start' | 'end'): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', properties: { end }, geometry: { type: 'Point', coordinates } };
}

function describePack(status: OfflinePackStatus): string {
  const mb = (status.completedTileSize / 1_000_000).toFixed(1);
  return `${status.state} ${Math.round(status.percentage)}% · ${status.completedTileCount} tiles · ${mb} MB`;
}

const shadow = { elevation: 8, shadowColor: '#0A100C', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } };

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
  syncPill: {
    height: touch.round, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(245, 239, 224, 0.2)', backgroundColor: colors.chromeRaised,
  },
  syncPillWarn: { borderColor: 'rgba(227, 163, 59, 0.5)', backgroundColor: 'rgba(227, 163, 59, 0.14)' },
  syncPillText: { color: colors.chromeText, fontSize: 15, fontWeight: '700' },
  chips: { gap: space.sm },
  chip: {
    height: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: 'rgba(16, 23, 19, 0.82)',
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  // Same size on and off, so picking a filter doesn't nudge the row
  chipOn: { backgroundColor: palette.canvas },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: colors.chromeText, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: palette.pine },
  // Runs to the screen edges and scrolls, instead of stopping short inside the header's margin
  filterRow: { marginHorizontal: -12 },
  filterChips: { paddingHorizontal: 12 },
  controls: { position: 'absolute', right: 12, gap: space.sm },
  control: { width: touch.min, height: touch.min, borderRadius: 14, backgroundColor: colors.chrome, alignItems: 'center', justifyContent: 'center' },
  peek: {
    ...shadow, position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  peekPhoto: {
    width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.chromeRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  alsoHere: { position: 'absolute', left: 12, right: 12 },
  alsoHereLabel: { alignSelf: 'center', color: palette.white, fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowRadius: 4 },
  // Square, like the place's pin
  peekPlace: { borderRadius: 6 },
  peekText: { flex: 1, gap: 3, minWidth: 0 },
  peekMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  peekBadge: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, borderRadius: 4, overflow: 'hidden', paddingVertical: 2, paddingHorizontal: 7 },
  peekTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 25, color: colors.text },
  peekSmall: { fontSize: 13, color: colors.textMuted },
  rideCard: {
    ...shadow, position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 16,
    paddingVertical: 12, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  rideCardText: { flex: 1, gap: 2 },
  rideCardActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6 },
  rideCardClose: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: space.xl, paddingHorizontal: space.lg, gap: 10,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  sheetText: { fontSize: 15, color: colors.text },
  sheetHint: { fontSize: 13, color: colors.textMuted },
  baseRow: { flexDirection: 'row', gap: 10 },
  baseChoice: {
    flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  baseChoiceOn: { backgroundColor: palette.sky, borderColor: palette.sky },
  baseText: { fontSize: 17, fontWeight: '800', color: colors.text },
  baseTextOn: { color: palette.white },
  sheetDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});
