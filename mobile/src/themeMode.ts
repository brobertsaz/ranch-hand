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
    return row?.value === 'light' || row?.value === 'dark' ? row.value : 'auto';
  } catch {
    // First launch, before the tables exist
    return 'auto';
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await connection().runAsync('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', KEY, mode);
}
