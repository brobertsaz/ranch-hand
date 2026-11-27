import * as SQLite from 'expo-sqlite';

export type ThemeMode = 'light' | 'dark' | 'auto';

const KEY = 'theme_mode';

// Synchronous on purpose: the theme has to be known before any screen's styles are built at import time.
// Its own connection, so theme.ts doesn't pull in db.ts (which imports the theme's neighbors).
function connection() {
  return SQLite.openDatabaseSync('ranch-hand.db');
}

export function readThemeMode(): ThemeMode {
  try {
    const row = connection().getFirstSync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', KEY);
    // Light until someone picks otherwise: most use is outdoors in daylight, and the phone's own dark setting
    // (often on all day) would hand them the night look at noon
    return row?.value === 'dark' || row?.value === 'auto' ? row.value : 'light';
  } catch {
    // First launch, before the tables exist
    return 'light';
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await connection().runAsync('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', KEY, mode);
}
