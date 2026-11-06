import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  AUTH_CREATE_OWNER_CHANNEL,
  AUTH_LOGIN_CHANNEL,
  AUTH_LOGOUT_CHANNEL,
  AUTH_STATUS_CHANNEL,
  type AuthStatusResult,
  type CreateOwnerInput,
  type LoginInput,
  type ProfileDto,
  type SessionDto,
} from '../../shared/ipc.js';
import type { AppDatabase } from '../infrastructure/db/connection.js';
import { parseIpcInput, respond } from './result.js';
import {
  authenticate,
  createProfile,
  getOwnerProfile,
  type IdentityDeps,
  type InMemorySessionStore,
  type Profile,
} from '../modules/identity/api.js';
import { AppError } from '../shared/errors.js';

const createOwnerSchema = z.object({ name: z.string(), password: z.string() });
const loginSchema = z.object({ password: z.string() });
const logoutSchema = z.string();

function toDto(profile: Profile): ProfileDto {
  return { id: profile.id, name: profile.name, role: profile.role };
}

export interface AuthHandlers {
  status(): AuthStatusResult;
  createOwner(input: CreateOwnerInput): Promise<ProfileDto>;
  login(input: LoginInput): Promise<SessionDto>;
  logout(sessionId: string): void;
}

/**
 * Use cases моста входа/первого запуска. Вынесены из `ipcMain`, чтобы
 * проверяться интеграционным тестом без запуска Electron.
 */
export function createAuthHandlers(
  db: AppDatabase,
  deps: IdentityDeps,
  sessions: InMemorySessionStore,
): AuthHandlers {
  return {
    status(): AuthStatusResult {
      const profile = getOwnerProfile(db);
      return { needsOwner: profile === undefined, profile: profile ? toDto(profile) : null };
    },
    async createOwner(input): Promise<ProfileDto> {
      const profile = await createProfile(
        db,
        { name: input.name, password: input.password, role: 'owner' },
        deps,
      );
      return toDto(profile);
    },
    async login(input): Promise<SessionDto> {
      const owner = getOwnerProfile(db);
      if (owner === undefined) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Профиль владельца не создан' });
      }
      const session = await authenticate(
        db,
        { name: owner.name, password: input.password },
        sessions,
        deps,
      );
      return { sessionId: session.id, profile: toDto(owner) };
    },
    logout(sessionId): void {
      sessions.end(sessionId);
    },
  };
}

export function registerAuth(
  db: AppDatabase,
  deps: IdentityDeps,
  sessions: InMemorySessionStore,
): void {
  const handlers = createAuthHandlers(db, deps, sessions);
  ipcMain.handle(AUTH_STATUS_CHANNEL, () => respond(() => handlers.status()));
  ipcMain.handle(AUTH_CREATE_OWNER_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.createOwner(parseIpcInput(createOwnerSchema, input))),
  );
  ipcMain.handle(AUTH_LOGIN_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.login(parseIpcInput(loginSchema, input))),
  );
  ipcMain.handle(AUTH_LOGOUT_CHANNEL, (_event, sessionId: unknown) =>
    respond(() => {
      handlers.logout(parseIpcInput(logoutSchema, sessionId));
      return null;
    }),
  );
}
