import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { db, getState, newId, setState } from './db';
import { distanceMeters, type LngLat } from './format';
import { palette } from './theme';

// Ride tracking runs as a background task so it keeps recording with the phone in a pocket.
// Each fix lands in ride_points; Stop folds them into one rides row that syncs to the crew.
const RIDE_TASK = 'ranch-hand-ride';
const ACTIVE_KEY = 'active_ride';

// Fixes worse than this are noise under trees and in draws; they'd zig-zag the track
const MAX_ACCURACY_METERS = 40;

export type ActiveRide = { id: string; startedAt: number };

// A fix every 10 m or 5 s: plenty for a horseback track, light on the battery.
// Android keeps it running through a foreground service, which has to show a notification.
const RIDE_UPDATES: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 10,
  timeInterval: 5000,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.OtherNavigation,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Recording your ride',
    notificationBody: 'Ranch Hand is tracking where you ride. Stop it from the Rides tab.',
    notificationColor: palette.trail,
  },
};

// Must be defined at module load, before the app renders, so Android can wake the task headless
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(RIDE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const active = await activeRide();
  if (!active) return;
  const conn = db();
  for (const fix of data.locations) {
    if ((fix.coords.accuracy ?? Infinity) > MAX_ACCURACY_METERS) continue;
    await conn.runAsync(
      'INSERT INTO ride_points (ride_id, latitude, longitude, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?)',
      active.id, fix.coords.latitude, fix.coords.longitude, fix.coords.accuracy, fix.timestamp,
    );
  }
});

export async function activeRide(): Promise<ActiveRide | null> {
  const json = await getState(ACTIVE_KEY);
  return json ? (JSON.parse(json) as ActiveRide) : null;
}

export async function startRide(): Promise<ActiveRide> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Ranch Hand needs Location to record a ride.');
  // "Allow all the time" keeps recording if Android stops the app; without it the notification keeps it alive
  await Location.requestBackgroundPermissionsAsync().catch(() => null);

  const ride = { id: newId(), startedAt: Date.now() };
  await setState(ACTIVE_KEY, JSON.stringify(ride));
  await Location.startLocationUpdatesAsync(RIDE_TASK, RIDE_UPDATES);
  return ride;
}

// After a reboot or force-stop the task is gone but the ride isn't; pick recording back up
export async function resumeRideIfNeeded(): Promise<void> {
  const active = await activeRide();
  if (!active || (await Location.hasStartedLocationUpdatesAsync(RIDE_TASK))) return;
  const { granted } = await Location.getForegroundPermissionsAsync();
  if (!granted) return;
  await Location.startLocationUpdatesAsync(RIDE_TASK, RIDE_UPDATES);
}

export async function ridePoints(rideId: string): Promise<LngLat[]> {
  const rows = await db().getAllAsync<{ longitude: number; latitude: number }>(
    'SELECT longitude, latitude FROM ride_points WHERE ride_id = ? ORDER BY recorded_at',
    rideId,
  );
  return rows.map((r) => [r.longitude, r.latitude]);
}

export function trackDistance(track: LngLat[]): number {
  let meters = 0;
  for (let i = 1; i < track.length; i++) meters += distanceMeters(track[i - 1], track[i]);
  return meters;
}

// Returns null when there's nothing worth keeping (fewer than two good fixes)
export async function stopRide(memberId: string): Promise<{ id: string; distance: number } | null> {
  if (await TaskManager.isTaskRegisteredAsync(RIDE_TASK)) await Location.stopLocationUpdatesAsync(RIDE_TASK);
  const active = await activeRide();
  if (!active) return null;

  const track = await ridePoints(active.id);
  const distance = trackDistance(track);
  const conn = db();
  await conn.withTransactionAsync(async () => {
    if (track.length >= 2) {
      await conn.runAsync(
        `INSERT INTO rides (id, member_id, started_at, ended_at, distance_meters, track, _status) VALUES (?, ?, ?, ?, ?, ?, 'created')`,
        active.id, memberId, active.startedAt, Date.now(), distance, JSON.stringify(track),
      );
    }
    await conn.runAsync('DELETE FROM ride_points WHERE ride_id = ?', active.id);
    await conn.runAsync('DELETE FROM sync_state WHERE key = ?', ACTIVE_KEY);
  });
  return track.length >= 2 ? { id: active.id, distance } : null;
}
