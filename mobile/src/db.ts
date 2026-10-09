import * as SQLite from 'expo-sqlite';

// Every write lands here first. _status follows WatermelonDB's convention so the
// sync client knows what still has to go up: synced | created | updated | deleted.
export type SyncStatus = 'synced' | 'created' | 'updated' | 'deleted';

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
  _status: SyncStatus;
};

// Read-only on the phone: the crew's names, pulled from the server
export type Member = { id: string; name: string; role: string | null };

// A finished ride. track is JSON text: [[lng, lat], ...]
export type Ride = {
  id: string;
  member_id: string | null;
  started_at: number;
  ended_at: number;
  distance_meters: number;
  track: string;
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

// Same shape as WatermelonDB's ids: 16 chars, generated on the phone so a record exists before the server sees it
export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Where an observation belongs: an existing place, a new one made on the spot, or nowhere
export type PlaceChoice = { waypointId: string } | { create: { kind: WaypointKind; name: string } } | null;

export async function createObservation(
  observation: Omit<Observation, 'id' | '_status' | 'member_id' | 'waypoint_id' | 'resolved_at' | 'resolved_by_id'>,
  photoId: string | null,
  memberId: string,
  place: PlaceChoice = null,
): Promise<string> {
  const id = newId();
  const conn = db();
  await conn.withTransactionAsync(async () => {
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
         SET status = 'resolved', resolved_at = ?, resolved_by_id = ?, _status = CASE _status WHEN 'created' THEN 'created' ELSE 'updated' END
         WHERE waypoint_id = ? AND status = 'open'`,
        observation.observed_at, memberId, waypointId,
      );
    }
  });
  return id;
}

// Resolving (or reopening) is an edit like any other: it syncs up, and the last write wins.
// Who and when are stamped here, on the phone, so they're right even with no signal.
export async function setObservationStatus(id: string, status: ObservationStatus, memberId: string): Promise<void> {
  const resolved = status === 'resolved';
  await db().runAsync(
    `UPDATE observations
     SET status = ?, resolved_at = ?, resolved_by_id = ?, _status = CASE _status WHEN 'created' THEN 'created' ELSE 'updated' END
     WHERE id = ?`,
    status, resolved ? Date.now() : null, resolved ? memberId : null, id,
  );
}

export async function memberNames(): Promise<Record<string, string>> {
  const rows = await db().getAllAsync<Member>('SELECT id, name, role FROM members');
  return Object.fromEntries(rows.map((m) => [m.id, m.name]));
}

export function liveRides() {
  return db().getAllAsync<Ride>(`SELECT * FROM rides WHERE _status != 'deleted' ORDER BY started_at DESC`);
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

export async function pendingCounts() {
  const conn = db();
  const records = await conn.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM waypoints WHERE _status != 'synced')
          + (SELECT COUNT(*) FROM rides WHERE _status != 'synced')
          + (SELECT COUNT(*) FROM observations WHERE _status != 'synced')
          + (SELECT COUNT(*) FROM photos WHERE _status != 'synced') AS n`,
  );
  const uploads = await conn.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM photos WHERE uploaded_at IS NULL AND _status != 'deleted'`);
  return { records: records?.n ?? 0, uploads: uploads?.n ?? 0 };
}

export async function getState(key: string): Promise<string | null> {
  const row = await db().getFirstAsync<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await db().runAsync('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
