import type { AppDatabase } from '../../infrastructure/db/connection.js';
import { withTransaction } from '../../infrastructure/db/transaction.js';
import { systemClock, type Clock } from '../../shared/clock.js';
import { AppError, type ErrorCode } from '../../shared/errors.js';
import type { EventRecorder } from '../../shared/events.js';
import { uuidv7 } from '../../shared/ids.js';
import { hashPassword, verifyPassword } from './password.js';
import type { InMemorySessionStore, Session } from './session.js';

export type ProfileRole = 'owner' | 'member';

/** Профиль без хеша пароля: наружу отдаётся только публичная часть. */
export interface Profile {
  id: string;
  name: string;
  role: ProfileRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityDeps {
  clock?: Clock;
  recorder: EventRecorder;
}

export interface CreateProfileInput {
  name: string;
  password: string;
  role?: ProfileRole;
}

interface ProfileRow {
  id: string;
  name: string;
  role: ProfileRole;
  password_hash: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

const SELECT_PROFILE =
  'SELECT id, name, role, password_hash, is_active, created_at, updated_at FROM profile';
const OWNER_EXISTS_MESSAGE = 'Владелец уже создан: в первой версии профиль owner один';

function fail(code: ErrorCode, message: string, details?: Record<string, unknown>): AppError {
  return new AppError({ code, message, retryable: false, ...(details && { details }) });
}

function conflict(message: string, reason: string): AppError {
  return fail('CONFLICT', message, { reason });
}

/** INV-16: последний активный `owner` не отключается, не понижается и не удаляется. */
function assertNotLastOwner(db: AppDatabase, row: ProfileRow): void {
  if (row.role !== 'owner' || row.is_active !== 1) return;
  const owners = db
    .prepare("SELECT COUNT(*) FROM profile WHERE role = 'owner' AND is_active = 1")
    .pluck()
    .get() as number;
  if (owners <= 1) {
    throw fail('BUSINESS_RULE', 'Нельзя отключить, понизить или удалить последнего владельца', {
      reason: 'LAST_OWNER',
    });
  }
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireProfile(db: AppDatabase, profileId: string): ProfileRow {
  const row = db.prepare(`${SELECT_PROFILE} WHERE id = ?`).get(profileId) as ProfileRow | undefined;
  if (row === undefined) throw fail('NOT_FOUND', 'Профиль не найден');
  return row;
}

function ownerExists(db: AppDatabase): boolean {
  return db.prepare("SELECT 1 FROM profile WHERE role = 'owner'").pluck().get() !== undefined;
}

/** Состояние, `change_log` и аудит пишутся одной транзакцией (ADR-0005). */
function recordProfileEvent(
  deps: IdentityDeps,
  row: Pick<ProfileRow, 'id' | 'name' | 'role'>,
  operation: string,
  action: string,
): void {
  deps.recorder.recordChange({
    entityType: 'profile',
    entityId: row.id,
    operation,
    payload: { name: row.name, role: row.role },
  });
  deps.recorder.recordAudit({
    profileId: row.id,
    action,
    entityType: 'profile',
    entityId: row.id,
  });
}

/**
 * `CreateProfile`: единственный профиль `owner` (плюс `member` как задел, ADR-0006).
 * Хеширование — вне транзакции (async), запись профиля, `change_log` и аудит — в одной.
 */
export async function createProfile(
  db: AppDatabase,
  input: CreateProfileInput,
  deps: IdentityDeps,
): Promise<Profile> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    throw fail('VALIDATION_FAILED', 'Имя профиля: от 1 до 100 символов');
  }
  if (input.password.length < 8 || input.password.length > 1024) {
    throw fail('VALIDATION_FAILED', 'Пароль: от 8 до 1024 символов');
  }
  const role = input.role ?? 'owner';
  if (role !== 'owner' && role !== 'member') throw fail('VALIDATION_FAILED', 'Неизвестная роль');

  const passwordHash = await hashPassword(input.password);
  const now = (deps.clock ?? systemClock).now().toISOString();
  const row: ProfileRow = {
    id: uuidv7(),
    name,
    role,
    password_hash: passwordHash,
    is_active: 1,
    created_at: now,
    updated_at: now,
  };
  withTransaction(db, () => {
    // Проверки внутри BEGIN IMMEDIATE: параллельный вызов ждёт коммита и видит owner,
    // поэтому двух owner не появится даже при двух экземплярах приложения.
    if (db.prepare('SELECT 1 FROM profile WHERE name = ?').pluck().get(name) !== undefined) {
      throw conflict('Профиль с таким именем уже существует', 'DUPLICATE_NAME');
    }
    if (role === 'owner' && ownerExists(db)) throw conflict(OWNER_EXISTS_MESSAGE, 'OWNER_EXISTS');
    db.prepare(
      `INSERT INTO profile (id, name, role, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.name, row.role, row.password_hash, row.is_active, row.created_at, now);
    recordProfileEvent(deps, row, 'created', 'profile.create');
  });
  return toProfile(row);
}

/**
 * `Authenticate`: активный профиль по имени + Argon2id. Ошибка одна и та же для
 * неизвестного имени и неверного пароля (без перечисления профилей); успешный вход
 * открывает сессию в памяти и пишет запись аудита.
 */
export async function authenticate(
  db: AppDatabase,
  input: { name: string; password: string },
  sessions: InMemorySessionStore,
  deps: IdentityDeps,
): Promise<Session> {
  const row = db
    .prepare(`${SELECT_PROFILE} WHERE name = ? AND is_active = 1`)
    .get(input.name.trim()) as ProfileRow | undefined;
  const valid = row !== undefined && (await verifyPassword(row.password_hash, input.password));
  if (!valid || row === undefined) {
    throw fail('UNAUTHENTICATED', 'Неверное имя профиля или пароль');
  }
  const session = sessions.create(row.id);
  withTransaction(db, () =>
    deps.recorder.recordAudit({
      profileId: row.id,
      action: 'auth.login',
      entityType: 'profile',
      entityId: row.id,
    }),
  );
  return session;
}

export function deactivateProfile(db: AppDatabase, profileId: string, deps: IdentityDeps): Profile {
  const row = requireProfile(db, profileId);
  assertNotLastOwner(db, row);
  const now = (deps.clock ?? systemClock).now().toISOString();
  withTransaction(db, () => {
    db.prepare('UPDATE profile SET is_active = 0, updated_at = ? WHERE id = ?').run(now, row.id);
    recordProfileEvent(deps, row, 'deactivated', 'profile.deactivate');
  });
  return toProfile({ ...row, is_active: 0, updated_at: now });
}

export function changeRole(
  db: AppDatabase,
  profileId: string,
  role: ProfileRole,
  deps: IdentityDeps,
): Profile {
  const row = requireProfile(db, profileId);
  if (role === 'owner' && row.role !== 'owner' && ownerExists(db)) {
    throw conflict(OWNER_EXISTS_MESSAGE, 'OWNER_EXISTS');
  }
  if (role === 'member') assertNotLastOwner(db, row);
  const now = (deps.clock ?? systemClock).now().toISOString();
  withTransaction(db, () => {
    db.prepare('UPDATE profile SET role = ?, updated_at = ? WHERE id = ?').run(role, now, row.id);
    recordProfileEvent(deps, { ...row, role }, 'role_changed', 'profile.change_role');
  });
  return toProfile({ ...row, role, updated_at: now });
}

/**
 * Мягкое удаление: профиль остаётся в файле (`is_active = 0`), чтобы не рвать
 * ссылки `audit_event.profile_id` и историю изменений (entities.md: профиль с
 * аудитом не удаляется физически). Вход по нему больше невозможен.
 */
export function deleteProfile(db: AppDatabase, profileId: string, deps: IdentityDeps): void {
  const row = requireProfile(db, profileId);
  assertNotLastOwner(db, row);
  const now = (deps.clock ?? systemClock).now().toISOString();
  withTransaction(db, () => {
    db.prepare('UPDATE profile SET is_active = 0, updated_at = ? WHERE id = ?').run(now, row.id);
    recordProfileEvent(deps, row, 'deleted', 'profile.delete');
  });
}
