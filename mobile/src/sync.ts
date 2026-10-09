import { File } from 'expo-file-system';
import { UploadType } from 'expo-file-system';

import { authHeader, photoFileUrl, pullChanges, pushChanges } from './api';
import { db, getState, setState, type Member, type Observation, type Photo, type Ride, type Waypoint } from './db';
import { photoFile } from './photoFiles';
import type { Device } from './settings';

// WatermelonDB's pull/push wire format, so the Rails endpoints match its docs:
// https://watermelondb.dev/docs/Sync/Backend
type TableChanges<T> = { created: T[]; updated: T[]; deleted: string[] };
type RawObservation = Omit<Observation, '_status'>;
type RawPhoto = Omit<Photo, '_status'>;
type RawWaypoint = Omit<Waypoint, '_status'>;
type RawRide = Omit<Ride, '_status'>;
export type Changes = {
  members?: TableChanges<Member>; // pull only
  waypoints: TableChanges<RawWaypoint>;
  observations: TableChanges<RawObservation>;
  photos: TableChanges<RawPhoto>;
  rides: TableChanges<RawRide>;
};

const NO_CHANGES = { created: [], updated: [], deleted: [] };
const MEMBER_COLUMNS = ['id', 'name', 'role'] as const;
const WAYPOINT_COLUMNS = ['id', 'member_id', 'kind', 'name', 'latitude', 'longitude', 'note'] as const;
const OBSERVATION_COLUMNS = [
  'id', 'member_id', 'kind', 'latitude', 'longitude', 'accuracy', 'observed_at', 'tag_number', 'note', 'status', 'waypoint_id',
  'resolved_at', 'resolved_by_id',
] as const;
const RIDE_COLUMNS = ['id', 'member_id', 'started_at', 'ended_at', 'distance_meters', 'track', 'name'] as const;
const PHOTO_COLUMNS = ['id', 'observation_id', 'uploaded_at'] as const;

export type SyncResult = { pulled: number; pushed: number; uploaded: number; downloaded: number };

let running: Promise<SyncResult> | null = null;

// One sync at a time; callers (app start, reconnect, save, the button) share the run in flight
export function sync(device: Device): Promise<SyncResult> {
  running ??= runSync(device).finally(() => {
    running = null;
  });
  return running;
}

async function runSync(device: Device): Promise<SyncResult> {
  const pulled = await pull(device);
  const pushed = await push(device);
  const uploaded = await uploadPhotos(device);
  const downloaded = await downloadPhotos(device);
  return { pulled, pushed, uploaded, downloaded };
}

async function pull(device: Device): Promise<number> {
  const lastPulledAt = await getState('last_pulled_at');
  const { changes, timestamp } = await pullChanges(device, lastPulledAt ? Number(lastPulledAt) : null);
  // A phone's first pull is the ranch's whole history; none of that is news to the person who just joined
  const arrivedAt = lastPulledAt ? Date.now() : null;
  const conn = db();
  let count = 0;

  await conn.withTransactionAsync(async () => {
    count += await applyRemote('members', MEMBER_COLUMNS, changes.members ?? NO_CHANGES, arrivedAt);
    count += await applyRemote('waypoints', WAYPOINT_COLUMNS, changes.waypoints ?? NO_CHANGES, arrivedAt);
    count += await applyRemote('observations', OBSERVATION_COLUMNS, changes.observations, arrivedAt);
    count += await applyRemote('photos', PHOTO_COLUMNS, changes.photos, arrivedAt);
    count += await applyRemote('rides', RIDE_COLUMNS, changes.rides ?? NO_CHANGES, arrivedAt);
    await setState('last_pulled_at', String(timestamp));
  });

  for (const id of changes.photos.deleted) {
    const file = photoFile(id);
    if (file.exists) file.delete();
  }
  return count;
}

// Tables whose rows feed "What's new": they note when a change from the crew reached this phone
const TRACKS_ARRIVAL = new Set(['waypoints', 'observations', 'rides']);

async function applyRemote<T extends Record<string, unknown>>(
  table: string,
  columns: readonly (keyof T & string)[],
  changes: TableChanges<T>,
  arrivedAt: number | null,
): Promise<number> {
  const conn = db();
  const tracked = TRACKS_ARRIVAL.has(table);
  const insertColumns = tracked ? [...columns, 'pulled_at'] : [...columns];
  const placeholders = insertColumns.map(() => '?').join(', ');
  const assignments = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
  if (tracked) {
    // Only a real change counts as news; pulls re-send a few unchanged rows on purpose
    const changed = columns.map((c) => `${table}.${c} IS NOT excluded.${c}`).join(' OR ');
    assignments.push(`pulled_at = CASE WHEN ${changed} THEN excluded.pulled_at ELSE ${table}.pulled_at END`);
  }
  for (const raw of [...changes.created, ...changes.updated]) {
    const values = columns.map((c) => (raw[c] ?? null) as string | number | null);
    if (tracked) values.push(arrivedAt);
    // A record with unpushed local edits keeps them; the push that follows makes them the last write
    await conn.runAsync(
      `INSERT INTO ${table} (${insertColumns.join(', ')}, _status) VALUES (${placeholders}, 'synced')
       ON CONFLICT(id) DO UPDATE SET ${assignments.join(', ')} WHERE ${table}._status = 'synced'`,
      values,
    );
  }
  for (const id of changes.deleted) {
    await conn.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
  }
  return changes.created.length + changes.updated.length + changes.deleted.length;
}

async function push(device: Device): Promise<number> {
  const conn = db();
  const waypoints = await conn.getAllAsync<Waypoint>(`SELECT * FROM waypoints WHERE _status != 'synced'`);
  const observations = await conn.getAllAsync<Observation>(`SELECT * FROM observations WHERE _status != 'synced'`);
  const photos = await conn.getAllAsync<Photo>(`SELECT * FROM photos WHERE _status != 'synced'`);
  const rides = await conn.getAllAsync<Ride>(`SELECT * FROM rides WHERE _status != 'synced'`);
  if (waypoints.length + observations.length + photos.length + rides.length === 0) return 0;

  await pushChanges(device, {
    waypoints: localChanges(waypoints),
    observations: localChanges(observations),
    photos: localChanges(photos),
    rides: localChanges(rides),
  });

  await conn.withTransactionAsync(async () => {
    for (const [table, rows] of [['waypoints', waypoints], ['observations', observations], ['photos', photos], ['rides', rides]] as const) {
      for (const row of rows) {
        // Only settle rows nobody edited while the push was in flight
        if (row._status === 'deleted') {
          await conn.runAsync(`DELETE FROM ${table} WHERE id = ? AND _status = 'deleted'`, row.id);
        } else {
          await conn.runAsync(`UPDATE ${table} SET _status = 'synced' WHERE id = ? AND _status = ?`, row.id, row._status);
        }
      }
    }
  });
  return waypoints.length + observations.length + photos.length + rides.length;
}

function localChanges<T extends { id: string; _status: string }>(rows: T[]): TableChanges<Omit<T, '_status'>> {
  const strip = ({ _status, ...raw }: T) => raw;
  return {
    created: rows.filter((r) => r._status === 'created').map(strip),
    updated: rows.filter((r) => r._status === 'updated').map(strip),
    deleted: rows.filter((r) => r._status === 'deleted').map((r) => r.id),
  };
}

// Photo bytes follow their record once it is on the server
async function uploadPhotos(device: Device): Promise<number> {
  const conn = db();
  const waiting = await conn.getAllAsync<Photo>(`SELECT * FROM photos WHERE uploaded_at IS NULL AND _status = 'synced'`);
  let uploaded = 0;

  for (const photo of waiting) {
    const file = photoFile(photo.id);
    if (!file.exists) continue;

    const result = await file.upload(photoFileUrl(device, photo.id), {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: 'image/jpeg',
      headers: { ...authHeader(device), 'Content-Type': 'image/jpeg' },
    });
    if (result.status >= 300) throw new Error(`Photo upload failed: ${result.status}`);

    // The server's own uploaded_at arrives on the next pull; this just stops a re-upload
    await conn.runAsync(`UPDATE photos SET uploaded_at = ? WHERE id = ? AND uploaded_at IS NULL`, Date.now(), photo.id);
    uploaded++;
  }
  return uploaded;
}

async function downloadPhotos(device: Device): Promise<number> {
  const conn = db();
  const remote = await conn.getAllAsync<Photo>(`SELECT * FROM photos WHERE uploaded_at IS NOT NULL AND _status = 'synced'`);
  let downloaded = 0;

  for (const photo of remote) {
    const destination = photoFile(photo.id);
    if (destination.exists) continue;

    await File.downloadFileAsync(photoFileUrl(device, photo.id), destination, { headers: authHeader(device) });
    downloaded++;
  }
  return downloaded;
}
