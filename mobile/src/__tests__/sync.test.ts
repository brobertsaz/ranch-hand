// The phone's half of sync, run against a real SQLite (Node's, in memory) with the server's answers scripted.
// Each test starts from an empty database: the modules are loaded fresh, so nothing carries over.

import type * as Api from '../api';
import type * as Db from '../db';
import type * as Sync from '../sync';
import type { Device } from '../settings';

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  pullChanges: jest.fn(),
  pushChanges: jest.fn(),
}));

type FileSystemMock = typeof import('../../__mocks__/expo-file-system');

const device: Device = { apiUrl: 'https://ranch.test', token: 'device-token', memberId: 'me', ranchName: 'Bar T' };
const DAY = 24 * 60 * 60 * 1000;

let db: typeof Db;
let sync: typeof Sync;
let api: jest.Mocked<typeof Api>;
let fs: FileSystemMock;

type Pulled = Partial<Record<'members' | 'waypoints' | 'observations' | 'photos' | 'rides', { created?: object[]; updated?: object[]; deleted?: string[] }>>;

// What the next pull answers with. Tables left out come back empty.
function serverHas(changes: Pulled = {}, timestamp = 1_800_000_000_000) {
  const table = (name: keyof Pulled) => ({ created: [], updated: [], deleted: [], ...changes[name] });
  api.pullChanges.mockResolvedValueOnce({
    changes: { members: table('members'), waypoints: table('waypoints'), observations: table('observations'), photos: table('photos'), rides: table('rides') },
    timestamp,
  } as Awaited<ReturnType<typeof Api.pullChanges>>);
}

function remoteObservation(id: string, overrides: object = {}) {
  return {
    id, member_id: 'sam', kind: 'sick_animal', latitude: 44.4, longitude: -104.3, accuracy: 5, observed_at: Date.now(), tag_number: '1147',
    note: 'Limping', status: 'open', waypoint_id: null, resolved_at: null, resolved_by_id: null, claimed_at: null, claimed_by_id: null, ...overrides,
  };
}

function logObservation(overrides: Partial<Parameters<typeof Db.createObservation>[0]> = {}, photoId: string | null = null) {
  return db.createObservation(
    { kind: 'sick_animal', latitude: 44.4, longitude: -104.3, accuracy: 5, observed_at: Date.now(), tag_number: '1147', note: 'Limping', status: 'open', ...overrides },
    photoId,
    'me',
  );
}

async function row<T = Record<string, unknown>>(table: string, id: string): Promise<T | null> {
  return db.db().getFirstAsync<T>(`SELECT * FROM ${table} WHERE id = ?`, id);
}

// The records the latest push carried, by table and list. A run with nothing to send makes no request at all.
function pushed() {
  const call = api.pushChanges.mock.lastCall;
  if (!call) throw new Error('Nothing was pushed.');
  return call[1];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const NONE = { created: [], updated: [], deleted: [] };
type PullAnswer = Awaited<ReturnType<typeof Api.pullChanges>>;

beforeEach(() => {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports -- loaded fresh per test, after resetModules */
  db = require('../db');
  sync = require('../sync');
  api = require('../api');
  fs = require('expo-file-system');
  /* eslint-enable @typescript-eslint/no-require-imports */
  api.pullChanges.mockReset();
  api.pushChanges.mockReset();
  api.pushChanges.mockResolvedValue({ rejected: [] });
});

describe('push', () => {
  it('sends a new record whole, then counts it as synced', async () => {
    const id = await logObservation();
    serverHas();

    const result = await sync.sync(device);

    expect(result).toMatchObject({ pushed: 1, rejected: 0 });
    expect(pushed().observations.created).toEqual([expect.objectContaining({ id, kind: 'sick_animal', tag_number: '1147', member_id: 'me' })]);
    expect(pushed().observations.created[0]).not.toHaveProperty('_status');
    expect(await row('observations', id)).toMatchObject({ _status: 'synced', _edited: '|' });
  });

  it("names only the fields this phone edited on an update, and none of the phone's own bookkeeping", async () => {
    serverHas({ observations: { created: [remoteObservation('o1')] } });
    await sync.sync(device);

    await db.setObservationStatus('o1', 'resolved', 'me');
    serverHas();
    await sync.sync(device);

    const [update] = pushed().observations.updated;
    expect(update).toMatchObject({ id: 'o1', status: 'resolved', _changed: ['status'] });
    expect(Object.keys(update)).not.toEqual(expect.arrayContaining(['_edited', '_status', 'pulled_at']));
    expect(await row('observations', 'o1')).toMatchObject({ _status: 'synced', _edited: '|' });
  });

  it('keeps an edit made while the push was in flight, and sends it next time', async () => {
    const id = await logObservation();
    serverHas();
    api.pushChanges.mockImplementationOnce(async () => {
      await db.setObservationStatus(id, 'resolved', 'me');
      return { rejected: [] };
    });

    await sync.sync(device);

    // The server has the record now, so what's left is an update, with the edit still tracked
    expect(await row('observations', id)).toMatchObject({ _status: 'updated', status: 'resolved', _edited: '|status|' });

    serverHas();
    await sync.sync(device);
    expect(pushed().observations.updated).toEqual([expect.objectContaining({ id, status: 'resolved', _changed: ['status'] })]);
    expect(await row('observations', id)).toMatchObject({ _status: 'synced' });
  });

  it('parks a record the server turns down, with its reason, and stops sending it', async () => {
    const id = await logObservation();
    serverHas();
    api.pushChanges.mockResolvedValueOnce({ rejected: [{ table: 'observations', id, reason: 'Kind is not included in the list' }] });

    expect(await sync.sync(device)).toMatchObject({ pushed: 0, rejected: 1 });
    expect(await db.syncProblems()).toEqual([{ table: 'observations', id, reason: 'Kind is not included in the list' }]);
    expect(await db.pendingCounts()).toMatchObject({ records: 0 });

    serverHas();
    await sync.sync(device);
    expect(api.pushChanges).toHaveBeenCalledTimes(1);
  });

  it('sends a turned-down record again, as what it was, once it is edited', async () => {
    const id = await logObservation();
    serverHas();
    api.pushChanges.mockResolvedValueOnce({ rejected: [{ table: 'observations', id, reason: 'no' }] });
    await sync.sync(device);

    await db.setObservationStatus(id, 'resolved', 'me');

    expect(await row('observations', id)).toMatchObject({ _status: 'created', _rejected_reason: null });
    serverHas();
    await sync.sync(device);
    expect(pushed().observations.created).toEqual([expect.objectContaining({ id, status: 'resolved' })]);
  });

  it('cuts a batch the server calls too big in half, and turns down a single record that is too big by itself', async () => {
    const small = await db.createWaypoint({ kind: 'gate', name: 'Creek gate', latitude: 44.4, longitude: -104.3, note: null }, 'me');
    const huge = await logObservation();
    serverHas();
    api.pushChanges.mockImplementation(async (_device, changes) => {
      const records = changes.waypoints.created.length + changes.observations.created.length;
      if (records > 1 || changes.observations.created.length === 1) throw new (jest.requireActual<typeof Api>('../api').ApiError)(413, 'too big');
      return { rejected: [] };
    });

    expect(await sync.sync(device)).toMatchObject({ pushed: 1, rejected: 1 });
    expect(await row('waypoints', small)).toMatchObject({ _status: 'synced' });
    expect(await row('observations', huge)).toMatchObject({ _status: 'rejected', _rejected_reason: 'Too big for the server to take.' });
  });

  it('drops a place the server never saw, and sends the delete of one it has', async () => {
    const never = await db.createWaypoint({ kind: 'gate', name: 'Typo', latitude: 44.4, longitude: -104.3, note: null }, 'me');
    serverHas({ waypoints: { created: [{ id: 'w1', member_id: 'sam', kind: 'water', name: 'Water 1', latitude: 44.4, longitude: -104.3, note: null }] } });
    await sync.sync(device);
    api.pushChanges.mockClear();

    await db.deleteWaypoint(never);
    await db.deleteWaypoint('w1');
    // Synced by the run above, so this one is a delete to send, not a row to drop
    await db.deleteWaypoint(never);

    expect((await db.liveWaypoints()).map((w) => w.id)).toEqual([]);
    serverHas();
    await sync.sync(device);
    expect(pushed().waypoints.deleted.sort()).toEqual([never, 'w1'].sort());
    expect(await row('waypoints', 'w1')).toBeNull();
  });
});

describe('pull', () => {
  it('keeps the fields edited here, takes the rest from the server, and leaves the row waiting to go up', async () => {
    serverHas({ waypoints: { created: [{ id: 'w1', member_id: 'sam', kind: 'water', name: 'Water 1', latitude: 44.4, longitude: -104.3, note: null }] } });
    await sync.sync(device);
    await db.updateWaypoint('w1', { name: 'Creek tank' });

    // A teammate renamed it and added a note in the meantime; the pull lands before this phone's push
    serverHas({ waypoints: { updated: [{ id: 'w1', member_id: 'sam', kind: 'water', name: 'North tank', latitude: 44.4, longitude: -104.3, note: 'Float sticks' }] } });
    api.pushChanges.mockImplementationOnce(async () => {
      expect(await row('waypoints', 'w1')).toMatchObject({ name: 'Creek tank', note: 'Float sticks', _status: 'updated' });
      return { rejected: [] };
    });
    await sync.sync(device);

    expect(pushed().waypoints.updated).toEqual([expect.objectContaining({ id: 'w1', name: 'Creek tank', _changed: ['name'] })]);
  });

  it("keeps who resolved it and when on this phone until the resolve has gone up", async () => {
    serverHas({ observations: { created: [remoteObservation('o1')] } });
    await sync.sync(device);
    await db.setObservationStatus('o1', 'resolved', 'me');

    // The server still has it open; its null resolver must not blank "Resolved by you"
    serverHas({ observations: { updated: [remoteObservation('o1', { note: 'Limping, left hind' })] } });
    api.pushChanges.mockImplementationOnce(async () => {
      expect(await row('observations', 'o1')).toMatchObject({ status: 'resolved', resolved_by_id: 'me', note: 'Limping, left hind' });
      expect((await row<{ resolved_at: number | null }>('observations', 'o1'))?.resolved_at).not.toBeNull();
      return { rejected: [] };
    });
    await sync.sync(device);
    expect(api.pushChanges).toHaveBeenCalledTimes(1);
  });

  it("doesn't count or rewrite a row the server sends again unchanged", async () => {
    const observation = remoteObservation('o1');
    serverHas({ observations: { created: [observation] } });
    expect((await sync.sync(device)).pulled).toBe(1);

    // Every pull repeats the last few minutes; it mustn't look like news
    serverHas({ observations: { updated: [observation] } });
    expect((await sync.sync(device)).pulled).toBe(0);
  });

  it('marks what arrives after the first pull as news, but not the history a new phone starts with', async () => {
    serverHas({ observations: { created: [remoteObservation('old')] } });
    await sync.sync(device);
    serverHas({ observations: { updated: [remoteObservation('new')] } });
    await sync.sync(device);

    expect((await row<{ pulled_at: number | null }>('observations', 'old'))?.pulled_at).toBeNull();
    expect((await row<{ pulled_at: number | null }>('observations', 'new'))?.pulled_at).toEqual(expect.any(Number));
  });

  it('asks for changes since the last pull it finished', async () => {
    serverHas({}, 1_800_000_000_000);
    await sync.sync(device);
    serverHas({}, 1_800_000_060_000);
    await sync.sync(device);

    expect(api.pullChanges.mock.calls.map((call) => call[1])).toEqual([null, 1_800_000_000_000]);
  });

  it("doesn't move the sync position when the pull's rows can't be saved", async () => {
    serverHas({}, 1_800_000_000_000);
    await sync.sync(device);
    // A record with no kind breaks the insert partway through the transaction
    serverHas({ observations: { updated: [remoteObservation('ok'), remoteObservation('bad', { kind: null })] } }, 1_800_000_060_000);

    await expect(sync.sync(device)).rejects.toThrow();

    expect(await db.getState('last_pulled_at')).toBe('1800000000000');
    expect(await row('observations', 'ok')).toBeNull();
  });

  it('removes what the crew deleted, and its photo file', async () => {
    serverHas({ observations: { created: [remoteObservation('o1')] }, photos: { created: [{ id: 'p1', observation_id: 'o1', uploaded_at: 1 }] } });
    await sync.sync(device);
    expect(fs.__fs.files.has('/documents/photos/p1.jpg')).toBe(true);

    serverHas({ observations: { deleted: ['o1'] }, photos: { deleted: ['p1'] } });
    await sync.sync(device);

    expect(await row('observations', 'o1')).toBeNull();
    expect(fs.__fs.files.has('/documents/photos/p1.jpg')).toBe(false);
  });
});

describe('claiming', () => {
  beforeEach(async () => {
    serverHas({ observations: { created: [remoteObservation('o1')] } });
    await sync.sync(device);
  });

  it("sends \"I've got it\" as an edit to the claim alone", async () => {
    await db.claimObservation('o1', 'me');
    serverHas();
    await sync.sync(device);

    expect(pushed().observations.updated).toEqual([expect.objectContaining({ id: 'o1', claimed_by_id: 'me', claimed_at: expect.any(Number), _changed: ['claimed_by_id'] })]);
  });

  it('keeps the claim and its time through a pull that lands before the push', async () => {
    await db.claimObservation('o1', 'me');
    serverHas({ observations: { updated: [remoteObservation('o1', { note: 'Worse today' })] } });
    api.pushChanges.mockImplementationOnce(async () => {
      expect(await row('observations', 'o1')).toMatchObject({ claimed_by_id: 'me', note: 'Worse today' });
      expect((await row<{ claimed_at: number | null }>('observations', 'o1'))?.claimed_at).not.toBeNull();
      return { rejected: [] };
    });
    await sync.sync(device);
    expect(api.pushChanges).toHaveBeenCalledTimes(1);
  });

  it("takes a teammate's claim from the server", async () => {
    serverHas({ observations: { updated: [remoteObservation('o1', { claimed_by_id: 'sam', claimed_at: 1_800_000_000_000 })] } });
    await sync.sync(device);

    expect(await row('observations', 'o1')).toMatchObject({ claimed_by_id: 'sam', claimed_at: 1_800_000_000_000 });
  });

  it('lets go of the claim when it is reopened, and says so to the server', async () => {
    await db.claimObservation('o1', 'me');
    await db.setObservationStatus('o1', 'resolved', 'me');
    expect(await row('observations', 'o1')).toMatchObject({ status: 'resolved', claimed_by_id: 'me' });

    await db.setObservationStatus('o1', 'open', 'me');

    expect(await row('observations', 'o1')).toMatchObject({ status: 'open', claimed_by_id: null, claimed_at: null, resolved_by_id: null });
    serverHas();
    await sync.sync(device);
    expect([...(pushed().observations.updated[0]._changed ?? [])].sort()).toEqual(['claimed_by_id', 'status']);
  });
});

describe('photos', () => {
  const upload = () => fs.__fs.upload;
  const download = () => fs.__fs.download;

  it('uploads a photo once its record is on the server, and only once', async () => {
    await logObservation({}, 'p1');
    fs.__fs.files.add('/documents/photos/p1.jpg');
    serverHas();

    expect(await sync.sync(device)).toMatchObject({ uploaded: 1 });
    expect(upload()).toHaveBeenCalledWith('https://ranch.test/api/v1/photos/p1/file', expect.objectContaining({ httpMethod: 'PUT' }), expect.anything());

    serverHas();
    expect(await sync.sync(device)).toMatchObject({ uploaded: 0 });
    expect(upload()).toHaveBeenCalledTimes(1);
  });

  it('holds the photo back while the server has turned its record down', async () => {
    await logObservation({}, 'p1');
    fs.__fs.files.add('/documents/photos/p1.jpg');
    serverHas();
    api.pushChanges.mockResolvedValueOnce({ rejected: [{ table: 'photos', id: 'p1', reason: "Observation must exist" }] });

    await sync.sync(device);

    expect(upload()).not.toHaveBeenCalled();
  });

  it('stops retrying a file the server will never take, and says why', async () => {
    await logObservation({}, 'p1');
    fs.__fs.files.add('/documents/photos/p1.jpg');
    upload().mockResolvedValueOnce({ status: 413, body: '' });
    serverHas();
    await sync.sync(device);
    serverHas();
    await sync.sync(device);

    expect(upload()).toHaveBeenCalledTimes(1);
    expect(await db.syncProblems()).toEqual([{ table: 'photos', id: 'p1', reason: 'The photo is too big for the server.' }]);
  });

  it("reports a photo that didn't go up without failing the sync, and tries again next time", async () => {
    await logObservation({}, 'p1');
    fs.__fs.files.add('/documents/photos/p1.jpg');
    upload().mockResolvedValueOnce({ status: 502, body: '' });
    serverHas();

    expect(await sync.sync(device)).toMatchObject({ pushed: 2, uploaded: 0, photoProblem: expect.stringContaining("didn't upload") });

    serverHas();
    expect(await sync.sync(device)).toMatchObject({ uploaded: 1, photoProblem: null });
  });

  describe('coming down', () => {
    const old = () => Date.now() - 90 * DAY;

    // An open problem from long ago, a settled one from long ago, and a settled one from last week
    beforeEach(() => {
      serverHas({
        observations: {
          created: [
            remoteObservation('open-old', { observed_at: old() }),
            remoteObservation('done-old', { observed_at: old(), status: 'resolved' }),
            remoteObservation('done-recent', { observed_at: Date.now() - 7 * DAY, status: 'resolved' }),
            remoteObservation('not-sent', {}),
          ],
        },
        photos: {
          created: [
            { id: 'p-open-old', observation_id: 'open-old', uploaded_at: 1 },
            { id: 'p-done-old', observation_id: 'done-old', uploaded_at: 1 },
            { id: 'p-done-recent', observation_id: 'done-recent', uploaded_at: 1 },
            // Its phone hasn't sent the file up yet
            { id: 'p-not-sent', observation_id: 'not-sent', uploaded_at: null },
          ],
        },
      });
    });

    it("brings down photos of what's open or recent, open first, and leaves old settled ones on the server", async () => {
      expect(await sync.sync(device)).toMatchObject({ downloaded: 2 });

      expect(download().mock.calls.map((call) => call[0])).toEqual([
        'https://ranch.test/api/v1/photos/p-open-old/file',
        'https://ranch.test/api/v1/photos/p-done-recent/file',
      ]);
      expect([...fs.__fs.files].sort()).toEqual(['/documents/photos/p-done-recent.jpg', '/documents/photos/p-open-old.jpg']);
    });

    it('fetches an old one when someone opens it', async () => {
      await sync.sync(device);
      const arrived = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same fresh module the sync uses
      (require('../photoFiles') as typeof import('../photoFiles')).onPhotoArrived(arrived);

      expect(await sync.fetchPhoto(device, 'p-done-old')).toBe(true);

      expect(fs.__fs.files.has('/documents/photos/p-done-old.jpg')).toBe(true);
      expect(arrived).toHaveBeenCalledWith('p-done-old');
      // Already here: no second download
      download().mockClear();
      expect(await sync.fetchPhoto(device, 'p-done-old')).toBe(true);
      expect(download()).not.toHaveBeenCalled();
    });

    it("says no, and leaves no half file, when it can't be had", async () => {
      await sync.sync(device);
      download().mockImplementationOnce(async (_url, destination) => {
        destination.create();
        throw new Error('fetch failed');
      });

      expect(await sync.fetchPhoto(device, 'p-done-old')).toBe(false);
      expect(await sync.fetchPhoto(device, 'p-not-sent')).toBe(false);
      expect([...fs.__fs.files].filter((path) => path.includes('p-done-old') || path.includes('p-not-sent'))).toEqual([]);
    });

    it('gives up for this run after two photos in a row fail, without failing the sync', async () => {
      download().mockRejectedValue(new Error('fetch failed'));

      expect(await sync.sync(device)).toMatchObject({ downloaded: 0, photoProblem: expect.stringContaining("didn't download") });
      expect(download()).toHaveBeenCalledTimes(2);
    });
  });
});

describe('one sync at a time', () => {
  it('gives everyone who asks during a run the same single follow-up run', async () => {
    const gate = deferred<PullAnswer>();
    api.pullChanges.mockImplementationOnce(() => gate.promise);
    serverHas();

    const first = sync.sync(device);
    const second = sync.sync(device);
    const third = sync.sync(device);
    gate.resolve({ changes: { waypoints: NONE, observations: NONE, photos: NONE, rides: NONE }, timestamp: 1 });
    await Promise.all([first, second, third]);

    expect(third).toBe(second);
    expect(api.pullChanges).toHaveBeenCalledTimes(2);
  });

  it('refuses to sync for a membership this phone has left', async () => {
    await sync.stopSync(device);

    await expect(sync.sync(device)).rejects.toBeInstanceOf(sync.SyncCancelled);
    expect(await sync.fetchPhoto(device, 'p1')).toBe(false);
    expect(api.pullChanges).not.toHaveBeenCalled();
  });

  it("stops a run in flight when the phone leaves, before it writes the old ranch back", async () => {
    const gate = deferred<PullAnswer>();
    api.pullChanges.mockImplementationOnce(() => gate.promise);

    const run = sync.sync(device);
    // Looked at before the run is let go, or its rejection would count as unhandled
    const outcome = expect(run).rejects.toBeInstanceOf(sync.SyncCancelled);
    const stopped = sync.stopSync(device);
    gate.resolve({ changes: { waypoints: NONE, observations: { ...NONE, created: [remoteObservation('o1')] }, photos: NONE, rides: NONE }, timestamp: 1 } as PullAnswer);
    await stopped;

    await outcome;
    expect(await row('observations', 'o1')).toBeNull();
  });
});
