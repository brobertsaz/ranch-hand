import type * as Db from '../db';
import type * as News from '../news';

let db: typeof Db;
let news: typeof News;

beforeEach(() => {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports -- a fresh, empty database per test */
  db = require('../db');
  news = require('../news');
  /* eslint-enable @typescript-eslint/no-require-imports */
});

function log(overrides: Partial<Parameters<typeof Db.createObservation>[0]> = {}, place: Db.PlaceChoice = null, by = 'me') {
  return db.createObservation(
    { kind: 'sick_animal', latitude: 44.4, longitude: -104.3, accuracy: 5, observed_at: Date.now(), tag_number: '1147', note: 'Limping', status: 'open', ...overrides },
    null,
    by,
    place,
  );
}

const find = async (id: string) => (await db.liveObservations()).find((o) => o.id === id)!;

it('saves a new place on the phone, waiting to go up', async () => {
  await db.createWaypoint({ kind: 'gate', name: ' Creek gate ', latitude: 44.4, longitude: -104.3, note: null }, 'me');

  expect(await db.liveWaypoints()).toMatchObject([{ name: 'Creek gate', _status: 'created', member_id: 'me' }]);
  expect(await db.pendingCounts()).toEqual({ records: 1, uploads: 0 });
});

it('makes the place with the first check there, and links the check to it', async () => {
  const id = await log({ kind: 'water_check', note: 'Low', tag_number: null }, { create: { kind: 'water', name: 'Water 1' } });

  const [tank] = await db.liveWaypoints();
  expect(tank).toMatchObject({ name: 'Water 1', kind: 'water', latitude: 44.4 });
  expect(await db.observationsAt(tank.id)).toMatchObject([{ id }]);
});

it("resolves a place's open problems when someone next finds it fine", async () => {
  const low = await log({ kind: 'water_check', note: 'Low', tag_number: null }, { create: { kind: 'water', name: 'Water 1' } });
  const [tank] = await db.liveWaypoints();
  const elsewhere = await log();

  await log({ kind: 'water_check', note: 'Full', tag_number: null, status: 'ok' }, { waypointId: tank.id }, 'sam');

  expect(await find(low)).toMatchObject({ status: 'resolved', resolved_by_id: 'sam' });
  expect(await find(elsewhere)).toMatchObject({ status: 'open' });
});

it('stamps who resolved it and when, and clears both on reopening', async () => {
  const id = await log();

  await db.setObservationStatus(id, 'resolved', 'me');
  expect(await find(id)).toMatchObject({ status: 'resolved', resolved_by_id: 'me', resolved_at: expect.any(Number) });

  await db.setObservationStatus(id, 'open', 'me');
  expect(await find(id)).toMatchObject({ status: 'open', resolved_by_id: null, resolved_at: null });
});

it("records \"I've got it\", a takeover, and letting go", async () => {
  const id = await log();

  await db.claimObservation(id, 'me');
  expect(await find(id)).toMatchObject({ claimed_by_id: 'me', claimed_at: expect.any(Number) });

  await db.claimObservation(id, 'sam');
  expect(await find(id)).toMatchObject({ claimed_by_id: 'sam' });

  await db.claimObservation(id, null);
  expect(await find(id)).toMatchObject({ claimed_by_id: null, claimed_at: null });
});

it("tells you when a teammate has taken something, but not about your own claims", async () => {
  const theirs = await log({ tag_number: '1147' }, null, 'sam');
  const mine = await log({ tag_number: '2210' }, null, 'sam');
  await db.claimObservation(theirs, 'jess');
  await db.claimObservation(mine, 'me');

  const items = await news.crewNews('me');

  expect(items.filter((item) => item.key.endsWith(':claimed'))).toMatchObject([{ key: `${theirs}:claimed`, memberId: 'jess', title: 'Tag 1147 · sick · has it' }]);
});

it('clears the ranch but keeps what belongs to the phone', async () => {
  await log();
  await db.setState('map_base', 'topo');
  await db.setState('last_pulled_at', '123');

  await db.clearRanchData();

  expect(await db.liveObservations()).toEqual([]);
  expect(await db.getState('last_pulled_at')).toBeNull();
  expect(await db.getState('map_base')).toBe('topo');
});

describe('fixing a pin', () => {
  const settle = (id: string) => db.write((conn) => conn.runAsync(`UPDATE observations SET _status = 'synced', _edited = '|', _changed = 0 WHERE id = ?`, id));
  const row = (id: string) => db.db().getFirstAsync<{ _status: string; _edited: string }>('SELECT _status, _edited FROM observations WHERE id = ?', id);

  it('changes only what was put right, and names those fields for the server to merge', async () => {
    const id = await log();
    await settle(id);

    await db.updateObservation(id, { kind: 'fence_issue', tag_number: null });

    expect(await find(id)).toMatchObject({ kind: 'fence_issue', tag_number: null, note: 'Limping', status: 'open', _status: 'updated' });
    expect(db.editedFields((await row(id))!._edited)).toEqual(['kind', 'tag_number']);
  });

  it('does nothing when nothing changed', async () => {
    const id = await log();
    await settle(id);

    await db.updateObservation(id, {});

    expect(await row(id)).toEqual({ _status: 'synced', _edited: '|' });
  });

  it('throws away a pin the server never saw, with its photo', async () => {
    const id = await db.createObservation(
      { kind: 'sick_animal', latitude: 44.4, longitude: -104.3, accuracy: 5, observed_at: 1, tag_number: null, note: null, status: 'open' },
      'photo1',
      'me',
    );

    await db.deleteObservation(id);

    expect(await db.liveObservations()).toEqual([]);
    expect(await db.photosFor(id)).toEqual([]);
    expect(await db.pendingCounts()).toEqual({ records: 0, uploads: 0 });
  });

  it('sends the delete up when the crew already has the pin, or a push is carrying it there now', async () => {
    const synced = await log();
    await settle(synced);
    const inFlight = await log();
    db.pushing.add(`observations:${inFlight}`);

    await db.deleteObservation(synced);
    await db.deleteObservation(inFlight);

    expect(await db.liveObservations()).toEqual([]);
    expect((await row(synced))!._status).toBe('deleted');
    expect((await row(inFlight))!._status).toBe('deleted');
  });
});

describe('tag history', () => {
  it('finds every sighting of a tag whatever the capitals or spaces, newest first, and no other tag', async () => {
    const first = await log({ tag_number: 'Y123', observed_at: 1000 });
    const second = await log({ tag_number: ' y123 ', observed_at: 2000 });
    await log({ tag_number: 'Y1234', observed_at: 3000 });
    const gone = await log({ tag_number: 'Y123', observed_at: 4000 });
    await db.deleteObservation(gone);

    expect((await db.observationsOfTag('y123')).map((o) => o.id)).toEqual([second, first]);
    expect(await db.observationsOfTag('')).toEqual([]);
  });

  it('reads a tag the same way it is saved', () => {
    expect(db.normalizeTag(' y123 ')).toBe('Y123');
    expect(db.normalizeTag('  ')).toBeNull();
    expect(db.normalizeTag(null)).toBeNull();
  });

  it('says how often a tag was logged before, leaving out the pin in hand', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports -- after resetModules, so it shares this test's database */
    const tags = require('../tags') as typeof import('../tags');
    const now = Date.now();
    const old = await log({ tag_number: '1147', observed_at: now - 3 * 86_400_000 });
    const current = await log({ tag_number: '1147', observed_at: now });

    expect(await tags.tagHint('1147', current)).toMatch(/^Logged once before, last /);
    expect(await tags.tagHint('1147')).toMatch(/^Logged 2 times before, last /);
    expect(await tags.tagHint('9999')).toBeNull();
    expect(await tags.tagHint('  ')).toBeNull();
    expect(old).not.toBe(current);
  });
});
