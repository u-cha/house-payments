import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_CREATE_OWNER_CHANNEL, AUTH_LOGIN_CHANNEL } from '../../src/shared/ipc.js';
import {
  createEventRecorder,
  openAppDatabase,
  type AppDatabase,
} from '../../src/main/infrastructure/db/index.js';
import { createAuthHandlers, registerAuth } from '../../src/main/ipc/auth.js';
import { InMemorySessionStore, type IdentityDeps } from '../../src/main/modules/identity/api.js';
import { FixedClock } from '../../src/main/shared/clock.js';
import { AppError } from '../../src/main/shared/errors.js';

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

// Electron в тесте не запускается: проверяем проводку обработчиков и контракт ответа.
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMock.handlers.set(channel, handler);
    },
  },
}));

const NOW = '2026-11-06T10:00:00.000Z';
const PASSWORD = 'correct horse battery staple';
const tempDirs: string[] = [];
let db: AppDatabase;
let deps: IdentityDeps;
let sessions: InMemorySessionStore;

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-auth-ipc-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
}

beforeEach(() => {
  db = openAppDatabase(tempDatabaseFile());
  deps = {
    clock: new FixedClock(NOW),
    recorder: createEventRecorder(db, { deviceId: 'device-1', clock: new FixedClock(NOW) }),
  };
  sessions = new InMemorySessionStore(new FixedClock(NOW));
  electronMock.handlers.clear();
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('auth IPC contract', () => {
  it('first run creates the owner, then login opens a memory-only session', async () => {
    const handlers = createAuthHandlers(db, deps, sessions);

    expect(handlers.status()).toEqual({ needsOwner: true, profile: null });

    const profile = await handlers.createOwner({ name: 'Владелец', password: PASSWORD });
    expect(profile).toMatchObject({ name: 'Владелец', role: 'owner' });
    expect(JSON.stringify(profile)).not.toContain('password');
    expect(handlers.status()).toEqual({ needsOwner: false, profile });

    const wrong = await handlers.login({ password: 'wrong password' }).catch((error) => error);
    expect(wrong).toBeInstanceOf(AppError);
    expect((wrong as AppError).code).toBe('UNAUTHENTICATED');

    const session = await handlers.login({ password: PASSWORD });
    expect(session).toMatchObject({ profile, sessionId: expect.any(String) });
    expect(sessions.get(session.sessionId)?.profileId).toBe(profile.id);

    handlers.logout(session.sessionId);
    expect(sessions.get(session.sessionId)).toBeUndefined();
  });

  it('after a restart the old session token is unknown and login is required again', async () => {
    const handlers = createAuthHandlers(db, deps, sessions);
    await handlers.createOwner({ name: 'Владелец', password: PASSWORD });
    const session = await handlers.login({ password: PASSWORD });

    const restartedSessions = new InMemorySessionStore(new FixedClock(NOW));
    const restarted = createAuthHandlers(db, deps, restartedSessions);
    // Профиль в файле остался, но сессии в памяти нового процесса нет.
    expect(restarted.status()).toMatchObject({ needsOwner: false });
    expect(restartedSessions.get(session.sessionId)).toBeUndefined();
  });

  it('responds with a safe AppError envelope instead of throwing over IPC', async () => {
    registerAuth(db, deps, sessions);
    const createOwner = electronMock.handlers.get(AUTH_CREATE_OWNER_CHANNEL);
    const login = electronMock.handlers.get(AUTH_LOGIN_CHANNEL);
    expect(createOwner).toBeDefined();
    expect(login).toBeDefined();

    const invalid = await createOwner?.({}, { name: '', password: 'short' });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: expect.any(String), retryable: false },
    });

    const noOwner = await login?.({}, { password: PASSWORD });
    expect(noOwner).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
