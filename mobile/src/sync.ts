import { File } from 'expo-file-system';
import { UploadType } from 'expo-file-system';

import { authHeader, photoFileUrl, pullChanges, pushChanges } from './api';
import { db, getState, setState, type Observation, type Photo, type Waypoint } from './db';
import { photoFile } from './photoFiles';
import type { Device } from './settings';

// WatermelonDB's pull/push wire format, so the Rails endpoints match its docs:
// https://watermelondb.dev/docs/Sync/Backend
type TableChanges<T> = { created: T[]; updated: T[]; deleted: string[] };
type RawObservation = Omit<Observation, '_status'>;
type RawPhoto = Omit<Photo, '_status'>;
type RawWaypoint = Omit<Waypoint, '_status'>;
export type Changes = {
  waypoints: TableChanges<RawWaypoint>;
  observations: TableChanges<RawObservation>;
  photos: TableChanges<RawPhoto>;
};

const NO_CHANGES = { created: [], updated: [], deleted: [] };
const WAYPOINT_COLUMNS = ['id', 'member_id', 'kind', 'name', 'latitude', 'longitude', 'note'] as const;
const OBSERVATION_COLUMNS = [
  'id', 'member_id', 'kind', 'latitude', 'longitude', 'accuracy', 'observed_at', 'tag_number', 'note', 'status', 'waypoint_id',
] as const;
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
  const conn = db();
  let count = 0;

  await conn.withTransactionAsync(async () => {
    count += await applyRemote('waypoints', WAYPOINT_COLUMNS, changes.waypoints ?? NO_CHANGES);
    count += await applyRemote('observations', OBSERVATION_COLUMNS, changes.observations);
    count += await applyRemote('photos', PHOTO_COLUMNS, changes.photos);
    await setState('last_pulled_at', String(timestamp));
  });

  for (const id of changes.photos.deleted) {
    const file = photoFile(id);
    if (file.exists) file.delete();
  }
  return count;
}

async function applyRemote<T extends Record<string, unknown>>(
  table: string,
  columns: readonly (keyof T & string)[],
  changes: TableChanges<T>,
): Promise<number> {
  const conn = db();
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');

  for (const raw of [...changes.created, ...changes.updated]) {
    // A record with unpushed local edits keeps them; the push that follows makes them the last write
    await conn.runAsync(
      `INSERT INTO ${table} (${columns.join(', ')}, _status) VALUES (${placeholders}, 'synced')
       ON CONFLICT(id) DO UPDATE SET ${updates} WHERE ${table}._status = 'synced'`,
      columns.map((c) => (raw[c] ?? null) as string | number | null),
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
  if (waypoints.length === 0 && observations.length === 0 && photos.length === 0) return 0;

  await pushChanges(device, {
    waypoints: localChanges(waypoints),
    observations: localChanges(observations),
    photos: localChanges(photos),
  });

  await conn.withTransactionAsync(async () => {
    for (const [table, rows] of [['waypoints', waypoints], ['observations', observations], ['photos', photos]] as const) {
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
  return waypoints.length + observations.length + photos.length;
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
