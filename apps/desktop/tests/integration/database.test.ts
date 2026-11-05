import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUSY_TIMEOUT_MS,
  DEFAULT_MIGRATIONS_DIR,
  loadMigrations,
  migrate,
  openAppDatabase,
  openConnection,
} from '../../src/main/infrastructure/db/index.js';

const tempDirs: string[] = [];

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-db-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('SQLite connection', () => {
  it('includes WAL, foreign keys and busy_timeout', () => {
    const file = tempDatabaseFile();
    const db = openConnection(file);
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
    } finally {
      db.close();
    }
  });
});

describe('migration runner', () => {
  it('applies 001, is idempotent on reopen and keeps data', () => {
    const file = tempDatabaseFile();

    const first = openAppDatabase(file);
    const firstVersions = first
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .pluck()
      .all();
    expect(firstVersions).toEqual([1]);
    first
      .prepare('INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)')
      .run('theme', 'dark', '2026-11-05T00:00:00.000Z');
    expect(migrate(first, loadMigrations(DEFAULT_MIGRATIONS_DIR))).toEqual([]);
    first.close();

    const second = openAppDatabase(file);
    try {
      expect(second.prepare('SELECT value FROM setting WHERE key = ?').pluck().get('theme')).toBe(
        'dark',
      );
      expect(second.prepare('SELECT COUNT(*) FROM schema_version').pluck().get()).toBe(1);
      expect(migrate(second, loadMigrations(DEFAULT_MIGRATIONS_DIR))).toEqual([]);
    } finally {
      second.close();
    }
  });

  it('refuses a database newer than the app (INV-20)', () => {
    const file = tempDatabaseFile();
    const db = openConnection(file);
    try {
      migrate(db, loadMigrations(DEFAULT_MIGRATIONS_DIR));
      db.prepare('INSERT INTO schema_version (version, applied_at, note) VALUES (?, ?, ?)').run(
        2,
        '2026-11-05T00:00:00.000Z',
        'future',
      );
      expect(() => migrate(db, loadMigrations(DEFAULT_MIGRATIONS_DIR))).toThrow(
        /newer than supported/,
      );
    } finally {
      db.close();
    }
  });
});
