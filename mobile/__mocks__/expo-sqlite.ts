// expo-sqlite for Jest: the same calls db.ts and sync.ts make, on Node's built-in SQLite, in memory.
// The SQL under test is the real SQL, so the merge and settle rules are exercised as written.
import { DatabaseSync } from 'node:sqlite';

type Param = string | number | null;

// expo-sqlite takes parameters spread out or as one array
function flat(params: unknown[]): Param[] {
  return (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as Param[];
}

class FakeDatabase {
  private conn = new DatabaseSync(':memory:');

  execSync(sql: string): void {
    this.conn.exec(sql);
  }

  async execAsync(sql: string): Promise<void> {
    this.conn.exec(sql);
  }

  getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
    return (this.conn.prepare(sql).get(...flat(params)) as T | undefined) ?? null;
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return this.getFirstSync<T>(sql, ...params);
  }

  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    // Plain objects: node:sqlite's rows have a null prototype, which toEqual treats as a different type
    return this.conn.prepare(sql).all(...flat(params)).map((row) => ({ ...row })) as T[];
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> {
    const result = this.conn.prepare(sql).run(...flat(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  withTransactionSync(task: () => void): void {
    this.conn.exec('BEGIN');
    try {
      task();
      this.conn.exec('COMMIT');
    } catch (error) {
      this.conn.exec('ROLLBACK');
      throw error;
    }
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.conn.exec('BEGIN');
    try {
      await task();
      this.conn.exec('COMMIT');
    } catch (error) {
      this.conn.exec('ROLLBACK');
      throw error;
    }
  }
}

export type SQLiteDatabase = FakeDatabase;

export function openDatabaseSync(): FakeDatabase {
  return new FakeDatabase();
}

// Screens reload on these; nothing under test listens
export function addDatabaseChangeListener(): { remove: () => void } {
  return { remove: () => {} };
}
