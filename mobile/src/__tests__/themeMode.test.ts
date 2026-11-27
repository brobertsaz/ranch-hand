import type * as ThemeMode from '../themeMode';

let themeMode: typeof ThemeMode;
let shared: { execSync: (sql: string) => void };

beforeEach(() => {
  jest.resetModules();
  // themeMode opens a connection on every call; on the phone they all reach one file, so here they share one fake
  jest.doMock('expo-sqlite', () => {
    const fake = jest.requireActual('../../__mocks__/expo-sqlite');
    shared = fake.openDatabaseSync();
    return { ...fake, openDatabaseSync: () => shared };
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh, empty database per test
  themeMode = require('../themeMode');
});

function makeTable() {
  shared.execSync('CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT)');
}

it('is light on first launch, before the tables exist', () => {
  expect(themeMode.readThemeMode()).toBe('light');
});

it('is light when nothing has been picked', () => {
  makeTable();
  expect(themeMode.readThemeMode()).toBe('light');
});

it.each(['dark', 'auto', 'light'] as const)('keeps a %s pick', async (mode) => {
  makeTable();
  await themeMode.saveThemeMode(mode);
  expect(themeMode.readThemeMode()).toBe(mode);
});
