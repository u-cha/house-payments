import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEventRecorder,
  openAppDatabase,
  type AppDatabase,
} from '../../src/main/infrastructure/db/index.js';
import {
  InMemorySessionStore,
  authenticate,
  changeRole,
  createProfile,
  deactivateProfile,
  deleteProfile,
  type IdentityDeps,
} from '../../src/main/modules/identity/index.js';
import { FixedClock } from '../../src/main/shared/clock.js';
import { AppError } from '../../src/main/shared/errors.js';

const NOW = '2026-11-05T12:00:00.000Z';
const PASSWORD = 'correct horse battery staple';
const tempDirs: string[] = [];
let db: AppDatabase;
let deps: IdentityDeps;

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-identity-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
}

function count(table: 'profile' | 'change_log' | 'audit_event'): number {
  return db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number;
}

function captureError(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to fail');
}

beforeEach(() => {
  db = openAppDatabase(tempDatabaseFile());
  deps = {
    clock: new FixedClock(NOW),
    recorder: createEventRecorder(db, { deviceId: 'device-1', clock: new FixedClock(NOW) }),
  };
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('CreateProfile', () => {
  it('creates the single owner with an Argon2id hash and audits the creation', async () => {
    const profile = await createProfile(db, { name: 'Владелец', password: PASSWORD }, deps);

    expect(profile).toMatchObject({ name: 'Владелец', role: 'owner', isActive: true });
    const row = db.prepare('SELECT * FROM profile').get() as Record<string, unknown>;
    expect(row['password_hash']).toMatch(/^\$argon2id\$v=19\$/);
    expect(String(row['password_hash'])).not.toContain(PASSWORD);
    expect(JSON.stringify(row)).not.toContain(PASSWORD);

    const change = db.prepare('SELECT * FROM change_log').get() as Record<string, unknown>;
    expect(change).toMatchObject({
      entity_type: 'profile',
      entity_id: profile.id,
      operation: 'created',
    });
    expect(String(change['payload_json'])).not.toContain(PASSWORD);
    expect(db.prepare('SELECT action, profile_id FROM audit_event').get()).toEqual({
      action: 'profile.create',
      profile_id: profile.id,
    });
  });

  it('refuses a second owner and a duplicate name (single owner in the first version)', async () => {
    await createProfile(db, { name: 'Владелец', password: PASSWORD }, deps);

    const secondOwner = await createProfile(
      db,
      { name: 'Второй', password: PASSWORD, role: 'owner' },
      deps,
    ).catch((error: unknown) => error);
    expect(secondOwner).toBeInstanceOf(AppError);
    expect((secondOwner as AppError).code).toBe('CONFLICT');

    const duplicate = await createProfile(
      db,
      { name: 'Владелец', password: PASSWORD, role: 'member' },
      deps,
    ).catch((error: unknown) => error);
    expect((duplicate as AppError).code).toBe('CONFLICT');
    expect(count('profile')).toBe(1);
  });

  it('rejects an empty name and a short password without writing anything', async () => {
    await expect(createProfile(db, { name: '  ', password: PASSWORD }, deps)).rejects.toMatchObject(
      {
        code: 'VALIDATION_FAILED',
      },
    );
    await expect(
      createProfile(db, { name: 'Владелец', password: 'short' }, deps),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(count('profile')).toBe(0);
  });
});

describe('Authenticate', () => {
  let sessions: InMemorySessionStore;
  let ownerId: string;

  beforeEach(async () => {
    sessions = new InMemorySessionStore(new FixedClock(NOW));
    const owner = await createProfile(db, { name: 'Владелец', password: PASSWORD }, deps);
    ownerId = owner.id;
  });

  it('opens an in-memory session and audits the login', async () => {
    const session = await authenticate(
      db,
      { name: 'Владелец', password: PASSWORD },
      sessions,
      deps,
    );

    expect(session.profileId).toBe(ownerId);
    expect(sessions.get(session.id)).toMatchObject({ profileId: ownerId });
    expect(
      db.prepare('SELECT action, profile_id FROM audit_event WHERE action = ?').get('auth.login'),
    ).toEqual({ action: 'auth.login', profile_id: ownerId });
    const sessionTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%session%'")
      .all();
    expect(sessionTables).toEqual([]);
  });

  it('rejects a wrong password and an unknown profile as UNAUTHENTICATED without a session', async () => {
    for (const credentials of [
      { name: 'Владелец', password: 'wrong password' },
      { name: 'Неизвестный', password: PASSWORD },
    ]) {
      const error = await authenticate(db, credentials, sessions, deps).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('UNAUTHENTICATED');
      expect((error as AppError).message).not.toContain(credentials.password);
    }
    expect(count('audit_event')).toBe(1); // только profile.create
    expect(
      db.prepare('SELECT COUNT(*) FROM audit_event WHERE action = ?').pluck().get('auth.login'),
    ).toBe(0);
  });
});

describe('INV-16: последний owner', () => {
  it('cannot be deactivated, demoted or deleted', async () => {
    const owner = await createProfile(db, { name: 'Владелец', password: PASSWORD }, deps);

    const attempts: Array<() => unknown> = [
      () => deactivateProfile(db, owner.id, deps),
      () => changeRole(db, owner.id, 'member', deps),
      () => deleteProfile(db, owner.id, deps),
    ];
    for (const attempt of attempts) {
      const error = captureError(attempt);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('BUSINESS_RULE');
      expect((error as AppError).details).toMatchObject({ reason: 'LAST_OWNER' });
    }

    expect(db.prepare('SELECT role, is_active FROM profile WHERE id = ?').get(owner.id)).toEqual({
      role: 'owner',
      is_active: 1,
    });
  });

  it('soft-deletes a member, keeps the audit trail and blocks the login', async () => {
    const owner = await createProfile(db, { name: 'Владелец', password: PASSWORD }, deps);
    const member = await createProfile(
      db,
      { name: 'Член семьи', password: PASSWORD, role: 'member' },
      deps,
    );

    expect(deactivateProfile(db, member.id, deps)).toMatchObject({ isActive: false });
    expect(deleteProfile(db, member.id, deps)).toBeUndefined();
    // Мягкое удаление: строка и аудит остаются, вход по профилю невозможен.
    expect(db.prepare('SELECT id, is_active FROM profile ORDER BY id').all()).toEqual([
      { id: owner.id, is_active: 1 },
      { id: member.id, is_active: 0 },
    ]);
    expect(
      db.prepare('SELECT COUNT(*) FROM audit_event WHERE profile_id = ?').pluck().get(member.id),
    ).toBeGreaterThan(0);
    const sessions = new InMemorySessionStore(new FixedClock(NOW));
    const error = await authenticate(
      db,
      { name: 'Член семьи', password: PASSWORD },
      sessions,
      deps,
    ).catch((caught: unknown) => caught);
    expect((error as AppError).code).toBe('UNAUTHENTICATED');
  });
});
