import * as SQLite from 'expo-sqlite';

import { photoFile } from './photoFiles';

// Every write lands here first. _status follows WatermelonDB's convention so the
// sync client knows what still has to go up: synced | created | updated | deleted.
// rejected is ours: the server turned the record down, so it stays on this phone and stops being sent.
export type SyncStatus = 'synced' | 'created' | 'updated' | 'deleted' | 'rejected';

// Same order as the canvas's kind grid
export const KINDS = ['sick_animal', 'feed_check', 'water_check', 'fence_issue', 'gate_issue', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export const WAYPOINT_KINDS = ['feed', 'water', 'gate', 'fence', 'other'] as const;
export type WaypointKind = (typeof WAYPOINT_KINDS)[number];

// A place that stays put (feed station, tank, gate). Observations made there link to it.
export type Waypoint = {
  id: string;
  member_id: string | null;
  kind: WaypointKind;
  name: string;
  latitude: number;
  longitude: number;
  note: string | null;
  _status: SyncStatus;
};

export type ObservationStatus = 'open' | 'resolved' | 'ok';

export type Observation = {
  id: string;
  member_id: string | null;
  kind: Kind;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  observed_at: number;
  tag_number: string | null;
  note: string | null;
  // open: needs doing; resolved: was a problem, now handled; ok: a routine check that found nothing wrong
  status: ObservationStatus;
  waypoint_id: string | null;
  resolved_at: number | null;
  resolved_by_id: string | null;
  // "I've got it": the hand riding out to it, and when they said so. Only shown while it's open.
  claimed_at: number | null;
  claimed_by_id: string | null;
  _status: SyncStatus;
};

// Read-only on the phone: the crew's names, pulled from the server. A removed member (1) stays as a row
// so old records still carry their name, but leaves the Crew list.
export type Member = { id: string; name: string; role: string | null; removed?: number };

// A finished ride. track is JSON text: [[lng, lat], ...]
export type Ride = {
  id: string;
  member_id: string | null;
  started_at: number;
  ended_at: number;
  distance_meters: number;
  track: string;
  // Optional, so the crew can pick a route to follow: "North pasture via the creek gate"
  name: string | null;
  _status: SyncStatus;
};

export type Photo = {
  id: string;
  observation_id: string;
  uploaded_at: number | null;
  _status: SyncStatus;
};

const MIGRATIONS = [
  `CREATE TABLE observations (
    id TEXT PRIMARY KEY NOT NULL,
    member_id TEXT,
    kind TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    observed_at INTEGER NOT NULL,
    tag_number TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    _status TEXT NOT NULL DEFAULT 'created'
  );
  CREATE TABLE photos (
    id TEXT PRIMARY KEY NOT NULL,
    observation_id TEXT NOT NULL,
    uploaded_at INTEGER,
    _status TEXT NOT NULL DEFAULT 'created'
  );
  CREATE INDEX photos_observation_id ON photos (observation_id);
  CREATE TABLE sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT);`,
  `CREATE TABLE waypoints (
    id TEXT PRIMARY KEY NOT NULL,
    member_id TEXT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    note TEXT,
    _status TEXT NOT NULL DEFAULT 'created'
  );
  ALTER TABLE observations ADD COLUMN waypoint_id TEXT;
  CREATE INDEX observations_waypoint_id ON observations (waypoint_id);`,
  `ALTER TABLE observations ADD COLUMN resolved_at INTEGER;
  ALTER TABLE observations ADD COLUMN resolved_by_id TEXT;
  CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    _status TEXT NOT NULL DEFAULT 'synced'
  );
  CREATE TABLE rides (
    id TEXT PRIMARY KEY NOT NULL,
    member_id TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    distance_meters REAL NOT NULL DEFAULT 0,
    track TEXT NOT NULL DEFAULT '[]',
    _status TEXT NOT NULL DEFAULT 'created'
  );
  -- GPS fixes for the ride in progress; folded into a rides row when it stops
  CREATE TABLE ride_points (
    ride_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    recorded_at INTEGER NOT NULL
  );
  CREATE INDEX ride_points_ride_id ON ride_points (ride_id);`,
  // When a crew change reached this phone (not when it happened), for "What's new"
  `ALTER TABLE waypoints ADD COLUMN pulled_at INTEGER;
  ALTER TABLE observations ADD COLUMN pulled_at INTEGER;
  ALTER TABLE rides ADD COLUMN pulled_at INTEGER;`,
  `ALTER TABLE rides ADD COLUMN name TEXT;`,
  // _changed counts local edits, so a push only settles a row nobody touched while it was in flight.
  // _rejected_reason is what the server said; _rejected_was is the _status the row had when it was turned down.
  `ALTER TABLE waypoints ADD COLUMN _changed INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE waypoints ADD COLUMN _rejected_reason TEXT;
  ALTER TABLE waypoints ADD COLUMN _rejected_was TEXT;
  ALTER TABLE observations ADD COLUMN _changed INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE observations ADD COLUMN _rejected_reason TEXT;
  ALTER TABLE observations ADD COLUMN _rejected_was TEXT;
  ALTER TABLE photos ADD COLUMN _changed INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE photos ADD COLUMN _rejected_reason TEXT;
  ALTER TABLE photos ADD COLUMN _rejected_was TEXT;
  ALTER TABLE rides ADD COLUMN _changed INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE rides ADD COLUMN _rejected_reason TEXT;
  ALTER TABLE rides ADD COLUMN _rejected_was TEXT;
  -- Why the server refused the photo's file (too big, not a JPEG), so it isn't sent again
  ALTER TABLE photos ADD COLUMN upload_error TEXT;
  ALTER TABLE members ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;`,
  // _edited names the fields changed on this phone since the row was last in step with the server, as
  // "|note|status|". The push sends them so the server merges field by field, and a pull leaves them alone.
  // Rows already waiting as updates were edited before anyone kept track, so every editable field counts.
  `ALTER TABLE waypoints ADD COLUMN _edited TEXT NOT NULL DEFAULT '|';
  ALTER TABLE observations ADD COLUMN _edited TEXT NOT NULL DEFAULT '|';
  ALTER TABLE photos ADD COLUMN _edited TEXT NOT NULL DEFAULT '|';
  ALTER TABLE rides ADD COLUMN _edited TEXT NOT NULL DEFAULT '|';
  UPDATE waypoints SET _edited = '|kind|name|latitude|longitude|note|' WHERE _status = 'updated' OR (_status = 'rejected' AND _rejected_was = 'updated');
  UPDATE observations SET _edited = '|status|' WHERE _status = 'updated' OR (_status = 'rejected' AND _rejected_was = 'updated');
  UPDATE rides SET _edited = '|name|' WHERE _status = 'updated' OR (_status = 'rejected' AND _rejected_was = 'updated');`,
  // "I've got it": who is riding out to an open problem, so two hands don't both go
  `ALTER TABLE observations ADD COLUMN claimed_at INTEGER;
  ALTER TABLE observations ADD COLUMN claimed_by_id TEXT;`,
];

let database: SQLite.SQLiteDatabase | null = null;

export function db(): SQLite.SQLiteDatabase {
  if (!database) {
    database = SQLite.openDatabaseSync('ranch-hand.db', { enableChangeListener: true });
    migrate(database);
  }
  return database;
}

function migrate(conn: SQLite.SQLiteDatabase) {
  conn.execSync('PRAGMA journal_mode = WAL');
  const { user_version: version } = conn.getFirstSync<{ user_version: number }>('PRAGMA user_version')!;
  MIGRATIONS.slice(version).forEach((sql, index) => {
    conn.withTransactionSync(() => {
      conn.execSync(sql);
      conn.execSync(`PRAGMA user_version = ${version + index + 1}`);
    });
  });
}

// expo-sqlite's withTransactionAsync is a plain BEGIN/COMMIT on the one shared connection. Two writers that
// overlap (a save during a sync, a ride point during a save) land inside each other's transaction, and one
// ROLLBACK undoes both. So every write waits its turn here. Never call write or transaction from inside a
// task: it would wait on itself.
let writes: Promise<unknown> = Promise.resolve();

export function write<T>(task: (conn: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = writes.then(() => task(db()));
  writes = run.catch(() => {});
  return run;
}

export function transaction<T>(task: (conn: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return write(async (conn) => {
    let result!: T;
    await conn.withTransactionAsync(async () => {
      result = await task(conn);
    });
    return result;
  });
}

// Screens reload on database changes. A sync or a ride writes many rows, so changes are gathered for a
// moment and the listener runs once. `tables` narrows it to the tables the screen actually shows.
export function onDatabaseChange(tables: readonly string[] | null, listener: () => void, waitMs = 200): { remove: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sub = SQLite.addDatabaseChangeListener(({ tableName }) => {
    if (tables && !tables.includes(tableName)) return;
    timer ??= setTimeout(() => {
      timer = null;
      listener();
    }, waitMs);
  });
  return {
    remove: () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    },
  };
}

// What every local edit does to a row's sync columns: mark it to go up, note which fields changed, and bump
// the change count so a push already in flight doesn't settle it as synced. Editing a rejected record sends
// it again, as what it was. A field named twice in _edited is harmless; readers ignore repeats.
function touch(fields: readonly string[]): string {
  return `_status = CASE _status
    WHEN 'created' THEN 'created'
    WHEN 'rejected' THEN (CASE _rejected_was WHEN 'created' THEN 'created' ELSE 'updated' END)
    ELSE 'updated' END,
  _edited = _edited || '${fields.map((f) => `${f}|`).join('')}',
  _changed = _changed + 1, _rejected_reason = NULL, _rejected_was = NULL`;
}

// "|note|status|note|" -> ["note", "status"]
export function editedFields(edited: string): string[] {
  return [...new Set(edited.split('|').filter(Boolean))];
}

// Rows a push has sent and not heard back about, as "table:id". The server may already have them, so a
// delete in that window has to be sent rather than dropped on the phone.
export const pushing = new Set<string>();

// Same shape as WatermelonDB's ids: 16 chars, generated on the phone so a record exists before the server sees it
export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Where an observation belongs: an existing place, a new one made on the spot, or nowhere
export type PlaceChoice = { waypointId: string } | { create: { kind: WaypointKind; name: string } } | null;

export async function createObservation(
  observation: Omit<Observation, 'id' | '_status' | 'member_id' | 'waypoint_id' | 'resolved_at' | 'resolved_by_id' | 'claimed_at' | 'claimed_by_id'>,
  photoId: string | null,
  memberId: string,
  place: PlaceChoice = null,
): Promise<string> {
  const id = newId();
  await transaction(async (conn) => {
    let waypointId: string | null = null;
    if (place && 'waypointId' in place) waypointId = place.waypointId;
    if (place && 'create' in place) {
      waypointId = newId();
      await conn.runAsync(
        `INSERT INTO waypoints (id, member_id, kind, name, latitude, longitude, _status) VALUES (?, ?, ?, ?, ?, ?, 'created')`,
        waypointId, memberId, place.create.kind, place.create.name, observation.latitude, observation.longitude,
      );
    }
    await conn.runAsync(
      `INSERT INTO observations (id, member_id, kind, latitude, longitude, accuracy, observed_at, tag_number, note, status, waypoint_id, _status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created')`,
      id, memberId, observation.kind, observation.latitude, observation.longitude, observation.accuracy,
      observation.observed_at, observation.tag_number, observation.note, observation.status, waypointId,
    );
    if (photoId) {
      await conn.runAsync(`INSERT INTO photos (id, observation_id, _status) VALUES (?, ?, 'created')`, photoId, id);
    }
    // Someone just found this place fine ("Water: Full" after "Low"), so its open problems are handled
    if (waypointId && observation.status === 'ok') {
      await conn.runAsync(
        `UPDATE observations
         SET status = 'resolved', resolved_at = ?, resolved_by_id = ?, ${STATUS_EDIT}
         WHERE waypoint_id = ? AND status = 'open'`,
        observation.observed_at, memberId, waypointId,
      );
    }
  });
  return id;
}

// Who resolved it and when are written here so they show straight away with no signal, but only `status`
// is named as edited: the server decides resolved_by and resolved_at when status changes, and the next pull brings them.
const STATUS_EDIT = touch(['status']);

// Resolving (or reopening) is an edit like any other: it syncs up, and the last write wins.
// Who and when are stamped here, on the phone, so they're right even with no signal.
// Reopening also lets go of any claim: whoever had it thought it was handled.
export async function setObservationStatus(id: string, status: ObservationStatus, memberId: string): Promise<void> {
  const resolved = status === 'resolved';
  const reopened = status === 'open';
  await write((conn) =>
    conn.runAsync(
      `UPDATE observations SET status = ?, resolved_at = ?, resolved_by_id = ?,
         claimed_by_id = CASE WHEN ? THEN NULL ELSE claimed_by_id END, claimed_at = CASE WHEN ? THEN NULL ELSE claimed_at END,
         ${reopened ? REOPEN_EDIT : STATUS_EDIT}
       WHERE id = ?`,
      status, resolved ? Date.now() : null, resolved ? memberId : null, reopened ? 1 : 0, reopened ? 1 : 0, id,
    ),
  );
}

const REOPEN_EDIT = touch(['status', 'claimed_by_id']);
const CLAIM_EDIT = touch(['claimed_by_id']);

// "I've got it", or letting it go (memberId null). Taking over from another hand is the same edit: the last
// one to say so has it. Only claimed_by_id is named as edited; the server stamps it with whoever pushed.
export async function claimObservation(id: string, memberId: string | null): Promise<void> {
  await write((conn) =>
    conn.runAsync(
      `UPDATE observations SET claimed_by_id = ?, claimed_at = ?, ${CLAIM_EDIT} WHERE id = ?`,
      memberId, memberId ? Date.now() : null, id,
    ),
  );
}

// A place marked on its own, not as part of a check: a gate or tank mapped from the saddle or the house
export async function createWaypoint(
  waypoint: Pick<Waypoint, 'kind' | 'name' | 'latitude' | 'longitude' | 'note'>,
  memberId: string,
): Promise<string> {
  const id = newId();
  await write((conn) =>
    conn.runAsync(
      `INSERT INTO waypoints (id, member_id, kind, name, latitude, longitude, note, _status) VALUES (?, ?, ?, ?, ?, ?, ?, 'created')`,
      id, memberId, waypoint.kind, waypoint.name.trim(), waypoint.latitude, waypoint.longitude, waypoint.note?.trim() || null,
    ),
  );
  return id;
}

// Any hand can rename, re-kind or move a place; the last write wins like everything else
export async function updateWaypoint(id: string, changes: Partial<Pick<Waypoint, 'kind' | 'name' | 'latitude' | 'longitude' | 'note'>>): Promise<void> {
  const columns = Object.keys(changes) as (keyof typeof changes)[];
  if (columns.length === 0) return;
  await write((conn) =>
    conn.runAsync(
      `UPDATE waypoints SET ${columns.map((c) => `${c} = ?`).join(', ')}, ${touch(columns)} WHERE id = ?`,
      ...columns.map((c) => changes[c] ?? null), id,
    ),
  );
}

// Checks made there stay, as standalone pins. A place the server never saw just goes.
export async function deleteWaypoint(id: string): Promise<void> {
  await transaction(async (conn) => {
    if (!pushing.has(`waypoints:${id}`)) {
      await conn.runAsync(
        `DELETE FROM waypoints WHERE id = ? AND (_status = 'created' OR (_status = 'rejected' AND _rejected_was = 'created'))`,
        id,
      );
    }
    await conn.runAsync(
      `UPDATE waypoints SET _status = 'deleted', _changed = _changed + 1, _rejected_reason = NULL, _rejected_was = NULL WHERE id = ?`,
      id,
    );
  });
}

export async function memberRole(id: string): Promise<string | null> {
  const row = await db().getFirstAsync<{ role: string | null }>('SELECT role FROM members WHERE id = ?', id);
  return row?.role ?? null;
}

export async function memberNames(): Promise<Record<string, string>> {
  const rows = await db().getAllAsync<Member>('SELECT id, name, role FROM members');
  return Object.fromEntries(rows.map((m) => [m.id, m.name]));
}

export function liveRides() {
  return db().getAllAsync<Ride>(`SELECT * FROM rides WHERE _status != 'deleted' ORDER BY started_at DESC`);
}

export async function renameRide(id: string, name: string): Promise<void> {
  await write((conn) => conn.runAsync(`UPDATE rides SET name = ?, ${touch(['name'])} WHERE id = ?`, name.trim() || null, id));
}

// Leaving a ranch: its records and sync position go, so joining another ranch (or server) starts clean.
// The map choice and the light/dark look stay; they belong to the phone, not the ranch.
export async function clearRanchData(): Promise<void> {
  await write((conn) =>
    conn.execAsync(`
      DELETE FROM observations; DELETE FROM photos; DELETE FROM waypoints; DELETE FROM members;
      DELETE FROM rides; DELETE FROM ride_points;
      DELETE FROM sync_state WHERE key NOT IN ('map_base', 'theme_mode');
    `),
  );
}

// The owner took a hand off the crew. The next pull says the same; this just makes the list right straight away.
export async function markMemberRemoved(id: string): Promise<void> {
  await write((conn) => conn.runAsync('UPDATE members SET removed = 1 WHERE id = ?', id));
}

export function liveWaypoints() {
  return db().getAllAsync<Waypoint>(`SELECT * FROM waypoints WHERE _status != 'deleted' ORDER BY name`);
}

// Newest first: the first one is the place's current status
export function observationsAt(waypointId: string) {
  return db().getAllAsync<Observation>(
    `SELECT * FROM observations WHERE waypoint_id = ? AND _status != 'deleted' ORDER BY observed_at DESC`,
    waypointId,
  );
}

export function liveObservations() {
  return db().getAllAsync<Observation>(`SELECT * FROM observations WHERE _status != 'deleted' ORDER BY observed_at DESC`);
}

export function photosFor(observationId: string) {
  return db().getAllAsync<Photo>(`SELECT * FROM photos WHERE observation_id = ? AND _status != 'deleted'`, observationId);
}

// Still has to go up. Rejected records don't count: they've been sent, and the server said no.
export const UNSENT = `_status IN ('created', 'updated', 'deleted')`;

export async function pendingCounts() {
  const conn = db();
  const records = await conn.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM waypoints WHERE ${UNSENT})
          + (SELECT COUNT(*) FROM rides WHERE ${UNSENT})
          + (SELECT COUNT(*) FROM observations WHERE ${UNSENT})
          + (SELECT COUNT(*) FROM photos WHERE ${UNSENT}) AS n`,
  );
  // Only photos this phone can send: another hand's photo that hasn't reached the server yet is a row here
  // too, but its file isn't on this phone
  const waiting = await conn.getAllAsync<{ id: string }>(
    `SELECT id FROM photos WHERE uploaded_at IS NULL AND upload_error IS NULL AND _status IN ('created', 'updated', 'synced')`,
  );
  return { records: records?.n ?? 0, uploads: waiting.filter((p) => photoFile(p.id).exists).length };
}

// What the server turned down. It stays on this phone, and Settings lists it so nobody thinks it reached the crew.
export type SyncProblem = { table: 'waypoints' | 'observations' | 'photos' | 'rides'; id: string; reason: string | null };

export function syncProblems(): Promise<SyncProblem[]> {
  return db().getAllAsync<SyncProblem>(
    `SELECT 'waypoints' AS "table", id, _rejected_reason AS reason FROM waypoints WHERE _status = 'rejected'
     UNION ALL SELECT 'observations', id, _rejected_reason FROM observations WHERE _status = 'rejected'
     UNION ALL SELECT 'rides', id, _rejected_reason FROM rides WHERE _status = 'rejected'
     UNION ALL SELECT 'photos', id, COALESCE(_rejected_reason, upload_error) FROM photos WHERE _status = 'rejected' OR upload_error IS NOT NULL`,
  );
}

export async function getState(key: string): Promise<string | null> {
  const row = await db().getFirstAsync<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await write((conn) => putState(conn, key, value));
}

// For a write that's already inside write() or transaction()
export async function putState(conn: SQLite.SQLiteDatabase, key: string, value: string): Promise<void> {
  await conn.runAsync('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
