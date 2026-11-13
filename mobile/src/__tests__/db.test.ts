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
