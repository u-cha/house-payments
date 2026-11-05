import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DATA_FILE_NAME,
  dataFilePath,
  openAppDatabase,
  openConnection,
  openDataFile,
} from '../../src/main/infrastructure/db/index.js';
import { AppError } from '../../src/main/shared/index.js';

const NOW = '2026-11-05T12:00:00.000Z';
const SETTING_SQL = 'INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)';
const tempDirs: string[] = [];

function tempUserDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-userdata-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function captureError(work: () => void): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to fail');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('data file', () => {
  it('creates the file in userData, applies the schema and keeps data on reopen', () => {
    const userData = tempUserDataDir();
    const file = dataFilePath(userData);
    expect(path.dirname(file)).toBe(userData);
    expect(path.basename(file)).toBe(DATA_FILE_NAME);
    expect(existsSync(file)).toBe(false);

    const first = openDataFile(userData);
    try {
      expect(existsSync(file)).toBe(true);
      first.prepare(SETTING_SQL).run('theme', 'dark', NOW);
    } finally {
      first.close();
    }

    const second = openDataFile(userData);
    try {
      expect(second.prepare('SELECT value FROM setting WHERE key = ?').pluck().get('theme')).toBe(
        'dark',
      );
      expect(
        second.prepare('SELECT version FROM schema_version ORDER BY version').pluck().all(),
      ).toEqual([1, 2]);
    } finally {
      second.close();
    }
  });

  it('refuses a schema version newer than supported and leaves the file untouched', () => {
    const userData = tempUserDataDir();
    const file = dataFilePath(userData);
    const db = openAppDatabase(file);
    try {
      db.prepare(SETTING_SQL).run('theme', 'dark', NOW);
      db.prepare('INSERT INTO schema_version (version, applied_at, note) VALUES (?, ?, ?)').run(
        3,
        NOW,
        'future',
      );
    } finally {
      db.close();
    }
    const before = sha256(file);

    const error = captureError(() => openDataFile(userData));

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe('BUSINESS_RULE');
    expect(appError.details).toMatchObject({ reason: 'SCHEMA_VERSION_UNSUPPORTED' });
    expect(appError.retryable).toBe(false);
    expect(appError.message).not.toContain(userData);
    expect(appError.message).not.toMatch(/Users|tmp/);

    expect(sha256(file)).toBe(before);
    const check = openConnection(file);
    try {
      expect(check.prepare('SELECT MAX(version) FROM schema_version').pluck().get()).toBe(3);
      expect(check.prepare('SELECT value FROM setting WHERE key = ?').pluck().get('theme')).toBe(
        'dark',
      );
    } finally {
      check.close();
    }
  });

  it('rejects a file that is not a database without modifying it', () => {
    const userData = tempUserDataDir();
    const file = dataFilePath(userData);
    writeFileSync(file, 'not a sqlite database');
    const before = sha256(file);

    const error = captureError(() => openDataFile(userData));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details).toMatchObject({ reason: 'FILE_CORRUPTED' });
    expect((error as AppError).message).not.toContain(userData);
    expect(sha256(file)).toBe(before);
  });
});
