import { File, UploadType } from 'expo-file-system';

import type { SQLiteDatabase } from 'expo-sqlite';

import { ApiError, authHeader, deadline, errorCode, errorText, isSignedOut, PHOTO_TIMEOUT_MS, photoFileUrl, pullChanges, pushChanges, TimeoutError } from './api';
import { db, editedFields, getState, pushing, putState, transaction, UNSENT, write, type Member, type Observation, type Photo, type Ride, type SyncStatus, type Waypoint } from './db';
import { partialPhotoFile, photoArrived, photoFile } from './photoFiles';
import type { Device } from './settings';

// WatermelonDB's pull/push wire format, so the Rails endpoints match its docs:
// https://watermelondb.dev/docs/Sync/Backend
// _changed on an updated record names the fields this phone edited; the server applies only those
type TableChanges<T> = { created: T[]; updated: (T & { _changed?: string[] })[]; deleted: string[] };
type RawObservation = Omit<Observation, '_status'>;
type RawPhoto = Omit<Photo, '_status'>;
type RawWaypoint = Omit<Waypoint, '_status'>;
type RawRide = Omit<Ride, '_status'>;
export type Changes = {
  members?: TableChanges<Omit<Member, 'removed'> & { removed?: boolean }>; // pull only
  waypoints: TableChanges<RawWaypoint>;
  observations: TableChanges<RawObservation>;
  photos: TableChanges<RawPhoto>;
  rides: TableChanges<RawRide>;
};

const NO_CHANGES = { created: [], updated: [], deleted: [] };
const MEMBER_COLUMNS = ['id', 'name', 'role', 'removed'] as const;
const WAYPOINT_COLUMNS = ['id', 'member_id', 'kind', 'name', 'latitude', 'longitude', 'note'] as const;
const OBSERVATION_COLUMNS = [
  'id', 'member_id', 'kind', 'latitude', 'longitude', 'accuracy', 'observed_at', 'tag_number', 'note', 'status', 'waypoint_id',
  'resolved_at', 'resolved_by_id', 'claimed_at', 'claimed_by_id',
] as const;
const RIDE_COLUMNS = ['id', 'member_id', 'started_at', 'ended_at', 'distance_meters', 'track', 'name'] as const;
const PHOTO_COLUMNS = ['id', 'observation_id', 'uploaded_at'] as const;

// rejected: records the server turned down this run. photoProblem: why a photo didn't move, when the rest of the run worked.
export type SyncResult = { pulled: number; pushed: number; rejected: number; uploaded: number; downloaded: number; photoProblem: string | null };

// The run was stopped on purpose (the phone left the ranch), so there's nothing to tell the user
export class SyncCancelled extends Error {
  constructor() {
    super('Sync stopped.');
  }
}

type Run = { key: string; controller: AbortController; cancelled: boolean; promise: Promise<SyncResult> };
type Queued = { key: string; promise: Promise<SyncResult> };

let active: Run | null = null;
let queued: Queued | null = null;
// Phones that have left their ranch. A late sync for one must not write the old ranch back into the cleared tables.
const retired = new Set<string>();

// A rejoin gets a new token, so this tells one membership's runs from the next
function keyOf(device: Device): string {
  return `${device.apiUrl}|${device.token}`;
}

// One sync at a time. A call during a run (a save, the button) gets exactly one follow-up run, shared by
// everyone who asked meanwhile, so what was saved mid-run still goes up.
export function sync(device: Device): Promise<SyncResult> {
  const key = keyOf(device);
  if (retired.has(key)) return Promise.reject(new SyncCancelled());
  if (!active) return start(device, key);
  // The run in flight is for a membership this phone no longer has
  if (active.key !== key) cancel(active);
  if (queued?.key === key) return queued.promise;

  const previousKey = active.key;
  const mine: Queued = { key, promise: Promise.resolve(null as unknown as SyncResult) };
  mine.promise = active.promise
    .then(() => null, (error: unknown) => error)
    .then((error) => {
      if (queued !== mine) throw new SyncCancelled();
      queued = null;
      // A phone the server signed out stays signed out; asking again straight away only repeats the 401
      if (previousKey === key && isSignedOut(error)) throw error;
      return sync(device);
    });
  queued = mine;
  return mine.promise;
}

function start(device: Device, key: string): Promise<SyncResult> {
  const run: Run = { key, controller: new AbortController(), cancelled: false, promise: Promise.resolve(null as unknown as SyncResult) };
  run.promise = runSync(device, run)
    // An aborted request surfaces as whatever the network layer throws; the cause is the cancel
    .catch((error) => {
      throw run.cancelled ? new SyncCancelled() : error;
    })
    .finally(() => {
      if (active === run) active = null;
    });
  active = run;
  return run.promise;
}

function cancel(run: Run) {
  run.cancelled = true;
  run.controller.abort();
}

// Leaving a ranch: stop this phone's sync and wait until it has, so nothing writes after the tables are cleared
export async function stopSync(device: Device): Promise<void> {
  retired.add(keyOf(device));
  queued = null;
  const run = active;
  if (!run) return;
  cancel(run);
  await run.promise.catch(() => {});
}

// Checked inside every write a run makes. Writes go one at a time (see db.ts), so a run cancelled while its
// write waited in line finds out here, before it touches a table.
function guard(run: Run) {
  if (run.cancelled) throw new SyncCancelled();
}

async function runSync(device: Device, run: Run): Promise<SyncResult> {
  const pulled = await pull(device, run);
  const { pushed, rejected } = await push(device, run);
  const up = await uploadPhotos(device, run);
  const down = await downloadPhotos(device, run);
  return { pulled, pushed, rejected, uploaded: up.moved, downloaded: down.moved, photoProblem: up.problem ?? down.problem };
}

async function pull(device: Device, run: Run): Promise<number> {
  const lastPulledAt = await getState('last_pulled_at');
  const { changes, timestamp } = await pullChanges(device, lastPulledAt ? Number(lastPulledAt) : null, run.controller.signal);
  // A phone's first pull is the ranch's whole history; none of that is news to the person who just joined
  const arrivedAt = lastPulledAt ? Date.now() : null;
  // An older server doesn't say who was removed; nobody was
  const members = changes.members ?? NO_CHANGES;
  const flag = (m: (typeof members.created)[number]) => ({ ...m, removed: m.removed ? 1 : 0 });
  let count = 0;

  // The sync position moves in the same transaction as the rows it covers, so a rollback can never leave it
  // ahead of what's actually on the phone
  await transaction(async (conn) => {
    guard(run);
    count += await applyRemote(conn, 'members', MEMBER_COLUMNS, { created: members.created.map(flag), updated: members.updated.map(flag), deleted: members.deleted }, arrivedAt);
    count += await applyRemote(conn, 'waypoints', WAYPOINT_COLUMNS, changes.waypoints ?? NO_CHANGES, arrivedAt);
    count += await applyRemote(conn, 'observations', OBSERVATION_COLUMNS, changes.observations, arrivedAt);
    count += await applyRemote(conn, 'photos', PHOTO_COLUMNS, changes.photos, arrivedAt);
    count += await applyRemote(conn, 'rides', RIDE_COLUMNS, changes.rides ?? NO_CHANGES, arrivedAt);
    await putState(conn, 'last_pulled_at', String(timestamp));
  });

  for (const id of changes.photos.deleted) {
    const file = photoFile(id);
    if (file.exists) file.delete();
  }
  return count;
}

// Tables whose rows can be edited on the phone, so a pull merges into them field by field
const MERGES = new Set(['waypoints', 'observations', 'photos', 'rides']);

// Tables whose rows feed "What's new": they note when a change from the crew reached this phone
const TRACKS_ARRIVAL = new Set(['waypoints', 'observations', 'rides']);

async function applyRemote<T extends Record<string, unknown>>(
  conn: SQLiteDatabase,
  table: string,
  columns: readonly (keyof T & string)[],
  changes: TableChanges<T>,
  arrivedAt: number | null,
): Promise<number> {
  const tracked = TRACKS_ARRIVAL.has(table);
  const merges = MERGES.has(table);
  const insertColumns = tracked ? [...columns, 'pulled_at'] : [...columns];
  const placeholders = insertColumns.map(() => '?').join(', ');
  const fields = columns.filter((c) => c !== 'id');
  // A row with unsent edits keeps this phone's value for each field it edited and takes the server's for the
  // rest, and stays unsent: the push that follows sends just the edited fields, so both sides end up the same.
  // Who resolved it and when ride along with status: the server decides them from the status this phone sends,
  // so until that push lands the phone keeps its own, or a pull would blank "Resolved by you" in between.
  // When it was claimed rides with who claimed it, the same way.
  const tracks = (c: string) => (c === 'resolved_at' || c === 'resolved_by_id' ? 'status' : c === 'claimed_at' ? 'claimed_by_id' : c);
  const mine = (c: string) => (merges ? `(${table}._status = 'updated' AND instr(${table}._edited, '|${tracks(c)}|') > 0)` : '0');
  const assignments = fields.map((c) => `${c} = CASE WHEN ${mine(c)} THEN ${table}.${c} ELSE excluded.${c} END`);
  // Every pull re-sends the last few minutes of changes and the whole crew, on purpose. A row that would end
  // up the same as what's here is not written at all: no "new" badge, and no change event to make the screens reload.
  const changed = fields.map((c) => `(NOT ${mine(c)} AND ${table}.${c} IS NOT excluded.${c})`).join(' OR ');
  if (tracked) assignments.push('pulled_at = excluded.pulled_at');
  // Rows being created, deleted or turned down here are left alone, as before
  const open = merges ? `${table}._status IN ('synced', 'updated')` : `${table}._status = 'synced'`;
  let count = 0;
  for (const raw of [...changes.created, ...changes.updated]) {
    const values = columns.map((c) => (raw[c] ?? null) as string | number | null);
    if (tracked) values.push(arrivedAt);
    const result = await conn.runAsync(
      `INSERT INTO ${table} (${insertColumns.join(', ')}, _status) VALUES (${placeholders}, 'synced')
       ON CONFLICT(id) DO UPDATE SET ${assignments.join(', ')} WHERE ${open} AND (${changed})`,
      values,
    );
    count += result.changes;
  }
  for (const id of changes.deleted) {
    count += (await conn.runAsync(`DELETE FROM ${table} WHERE id = ?`, id)).changes;
  }
  return count;
}

// A row as it was when the push read it. _changed is the stamp every local edit bumps.
type Sent = { id: string; _status: SyncStatus; _changed: number; _edited: string };
type SentRows = { waypoints: (Waypoint & Sent)[]; observations: (Observation & Sent)[]; photos: (Photo & Sent)[]; rides: (Ride & Sent)[] };
type Table = keyof SentRows;
type Outcome = { table: Table; row: Sent; reason?: string };

const TABLES = ['waypoints', 'observations', 'photos', 'rides'] as const;
// Records per request. The server refuses a push over 20 MB, and a season of long rides could get there.
const PUSH_BATCH = 200;

async function push(device: Device, run: Run): Promise<{ pushed: number; rejected: number }> {
  // Read in the write line, so the snapshot can't catch another writer's half-finished transaction
  const sent = await write(async (conn): Promise<SentRows> => {
    guard(run);
    return {
      waypoints: await conn.getAllAsync(`SELECT * FROM waypoints WHERE ${UNSENT}`),
      observations: await conn.getAllAsync(`SELECT * FROM observations WHERE ${UNSENT}`),
      photos: await conn.getAllAsync(`SELECT * FROM photos WHERE ${UNSENT}`),
      rides: await conn.getAllAsync(`SELECT * FROM rides WHERE ${UNSENT}`),
    };
  });
  // Parents before children, across batches too: observations point at waypoints, photos at observations
  const all: Outcome[] = TABLES.flatMap((table) => (sent[table] as Sent[]).map((row) => ({ table, row })));
  let pushed = 0;
  let rejected = 0;

  for (let i = 0; i < all.length; i += PUSH_BATCH) {
    const outcomes = await sendBatch(device, run, sent, all.slice(i, i + PUSH_BATCH));
    await settle(run, outcomes);
    rejected += outcomes.filter((o) => o.reason !== undefined).length;
    pushed += outcomes.filter((o) => o.reason === undefined).length;
  }
  return { pushed, rejected };
}

// Sends one batch and says what became of each record. A batch the server calls too big (413) is cut in
// half and tried again; a single record that is too big by itself is turned down here, or the same body
// would be sent and refused on every sync from then on.
async function sendBatch(device: Device, run: Run, sent: SentRows, batch: Outcome[]): Promise<Outcome[]> {
  const keys = batch.map((o) => `${o.table}:${o.row.id}`);
  const inBatch = new Set(keys);
  const only = <T extends Sent>(table: Table, rows: T[]) => rows.filter((row) => inBatch.has(`${table}:${row.id}`));
  keys.forEach((key) => pushing.add(key));
  let response;
  try {
    response = await pushChanges(
      device,
      {
        waypoints: localChanges(only('waypoints', sent.waypoints), WAYPOINT_COLUMNS),
        observations: localChanges(only('observations', sent.observations), OBSERVATION_COLUMNS),
        photos: localChanges(only('photos', sent.photos), PHOTO_COLUMNS),
        rides: localChanges(only('rides', sent.rides), RIDE_COLUMNS),
      },
      run.controller.signal,
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 413) throw error;
    if (batch.length === 1) return [{ ...batch[0], reason: 'Too big for the server to take.' }];
    const half = Math.ceil(batch.length / 2);
    return [...(await sendBatch(device, run, sent, batch.slice(0, half))), ...(await sendBatch(device, run, sent, batch.slice(half)))];
  } finally {
    keys.forEach((key) => pushing.delete(key));
  }
  // An entry that matches no row sent (the server couldn't read its id) is skipped
  const reasons = new Map((response?.rejected ?? []).map((r) => [`${r.table}:${r.id}`, r.reason ?? 'No reason given']));
  return batch.map((o) => ({ ...o, reason: reasons.get(`${o.table}:${o.row.id}`) }));
}

async function settle(run: Run, outcomes: Outcome[]): Promise<void> {
  await transaction(async (conn) => {
    guard(run);
    for (const { table, row, reason } of outcomes) {
      // Every step only touches a row nobody edited while the push was in flight (same _changed).
      // One that was edited keeps its status, so the edit goes up on the next run.
      if (reason !== undefined) {
        await conn.runAsync(
          `UPDATE ${table} SET _status = 'rejected', _rejected_reason = ?, _rejected_was = ? WHERE id = ? AND _changed = ?`,
          reason, row._status, row.id, row._changed,
        );
      } else if (row._status === 'deleted') {
        await conn.runAsync(`DELETE FROM ${table} WHERE id = ? AND _status = 'deleted' AND _changed = ?`, row.id, row._changed);
      } else {
        // The edited fields are only forgotten here, with the push that carried them. A field edited mid-flight
        // fails the _changed test, so it stays tracked and goes up next time.
        await conn.runAsync(`UPDATE ${table} SET _status = 'synced', _edited = '|' WHERE id = ? AND _changed = ?`, row.id, row._changed);
        // Created, sent, then edited mid-flight: the server has the record now, so what's left to send is an update
        if (row._status === 'created') {
          await conn.runAsync(`UPDATE ${table} SET _status = 'updated' WHERE id = ? AND _status = 'created'`, row.id);
        }
      }
    }
  });
}

// Only the columns the server knows; the phone's own bookkeeping (_status, _edited, pulled_at) stays home.
// A created record goes whole. An updated one also says which fields this phone edited, as _changed.
function localChanges<T extends Sent>(rows: T[], columns: readonly (keyof T & string)[]) {
  const strip = (row: T) => Object.fromEntries(columns.map((c) => [c, row[c]])) as Omit<T, keyof Sent | '_status'> & { id: string };
  const wire = new Set<string>(columns);
  return {
    created: rows.filter((r) => r._status === 'created').map(strip),
    updated: rows.filter((r) => r._status === 'updated').map((r) => ({ ...strip(r), _changed: editedFields(r._edited).filter((f) => wire.has(f)) })),
    deleted: rows.filter((r) => r._status === 'deleted').map((r) => r.id),
  };
}

// After this many photos in a row fail, the signal is gone; the rest wait for the next sync instead of each timing out
const MAX_PHOTO_FAILURES = 2;

type PhotoPass = { moved: number; problem: string | null };

// One photo failing doesn't stop the others, but a cancel or a signed-out phone stops the run
function stopsRun(run: Run, error: unknown): boolean {
  return run.cancelled || error instanceof SyncCancelled || isSignedOut(error);
}

// Photo bytes follow their record once it is on the server
async function uploadPhotos(device: Device, run: Run): Promise<PhotoPass> {
  const waiting = await db().getAllAsync<Photo>(
    `SELECT * FROM photos WHERE uploaded_at IS NULL AND upload_error IS NULL AND _status = 'synced'`,
  );
  const pass: PhotoPass = { moved: 0, problem: null };
  let failures = 0;

  for (const photo of waiting) {
    const file = photoFile(photo.id);
    if (!file.exists) continue;
    guard(run);

    const limit = deadline(PHOTO_TIMEOUT_MS, run.controller.signal);
    try {
      const result = await file.upload(photoFileUrl(device, photo.id), {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: 'image/jpeg',
        headers: { ...authHeader(device), 'Content-Type': 'image/jpeg' },
        signal: limit.signal,
      });
      if (result.status === 401) throw new ApiError(401, 'Photo upload failed: 401', errorCode(result.body));
      if (result.status === 413 || result.status === 415 || result.status === 422) {
        // The server will never take this file, so trying again every sync would only burn battery and data
        const why = result.status === 413 ? 'The photo is too big for the server.' : result.status === 415 ? "The photo isn't a JPEG." : 'The photo file is empty.';
        await write(async (conn) => {
          guard(run);
          await conn.runAsync(`UPDATE photos SET upload_error = ? WHERE id = ?`, why, photo.id);
        });
        continue;
      }
      if (result.status >= 300) throw new Error(`Photo upload failed: ${result.status}`);

      // The server's own uploaded_at arrives on the next pull; this just stops a re-upload
      await write(async (conn) => {
        guard(run);
        await conn.runAsync(`UPDATE photos SET uploaded_at = ? WHERE id = ? AND uploaded_at IS NULL`, Date.now(), photo.id);
      });
      pass.moved++;
      failures = 0;
    } catch (error) {
      if (stopsRun(run, error)) throw error;
      pass.problem = `A photo didn't upload. ${errorText(limit.timedOut() ? new TimeoutError() : error)}`;
      if (++failures >= MAX_PHOTO_FAILURES) break;
    } finally {
      limit.clear();
    }
  }
  return pass;
}

// A ranch's whole photo history is too much to pull over one bar of signal, and most of it is settled business.
// A sync brings down the photos of what's still open and of anything from the last while; an older one is
// fetched when someone opens it (fetchPhoto).
export const PHOTO_KEEP_DAYS = 30;

async function downloadPhotos(device: Device, run: Run): Promise<PhotoPass> {
  // Open problems first, then newest first, so a short window of signal brings what the next ride needs
  const remote = await db().getAllAsync<Photo>(
    `SELECT photos.* FROM photos JOIN observations ON observations.id = photos.observation_id
     WHERE photos.uploaded_at IS NOT NULL AND photos._status = 'synced'
       AND (observations.status = 'open' OR observations.observed_at >= ?)
     ORDER BY (observations.status = 'open') DESC, observations.observed_at DESC`,
    Date.now() - PHOTO_KEEP_DAYS * 24 * 60 * 60 * 1000,
  );
  const pass: PhotoPass = { moved: 0, problem: null };
  let failures = 0;

  for (const photo of remote) {
    if (photoFile(photo.id).exists) continue;
    guard(run);

    try {
      await downloadPhoto(device, photo.id, run.controller.signal);
      guard(run);
      pass.moved++;
      failures = 0;
    } catch (error) {
      if (stopsRun(run, error)) throw error;
      pass.problem = `A photo didn't download. ${errorText(error)}`;
      if (++failures >= MAX_PHOTO_FAILURES) break;
    }
  }
  return pass;
}

// Downloads in flight by photo id, so a sync and an opened screen never write the same file at once
const downloading = new Map<string, Promise<void>>();

function downloadPhoto(device: Device, photoId: string, outer?: AbortSignal): Promise<void> {
  const inFlight = downloading.get(photoId);
  if (inFlight) return inFlight;

  const task = (async () => {
    // Into a .part file first, moved into place only once it's whole: a download cut off halfway (signal
    // dropped, app killed) must not sit under the real name looking finished
    const partial = partialPhotoFile(photoId);
    const limit = deadline(PHOTO_TIMEOUT_MS, outer);
    try {
      if (partial.exists) partial.delete();
      await File.downloadFileAsync(photoFileUrl(device, photoId), partial, { headers: authHeader(device), signal: limit.signal, idempotent: true });
      // Left the ranch while it was coming down: the photos folder has been cleared and must stay that way
      if (outer?.aborted || retired.has(keyOf(device))) throw new SyncCancelled();
      await partialPhotoFile(photoId).move(photoFile(photoId));
      photoArrived(photoId);
    } catch (error) {
      const leftover = partialPhotoFile(photoId);
      if (leftover.exists) leftover.delete();
      throw limit.timedOut() ? new TimeoutError() : error;
    } finally {
      limit.clear();
      downloading.delete(photoId);
    }
  })();
  downloading.set(photoId, task);
  return task;
}

// An older photo, when someone opens the observation it belongs to. True once it's on this phone; false when
// it can't be had right now (no signal, not uploaded yet), which the screen says in its own words.
export async function fetchPhoto(device: Device, photoId: string): Promise<boolean> {
  if (photoFile(photoId).exists) return true;
  if (retired.has(keyOf(device))) return false;
  const photo = await db().getFirstAsync<Photo>(`SELECT * FROM photos WHERE id = ? AND uploaded_at IS NOT NULL AND _status = 'synced'`, photoId);
  if (!photo) return false;
  try {
    await downloadPhoto(device, photoId);
    return true;
  } catch {
    return false;
  }
}
