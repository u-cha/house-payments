// Контракт IPC-моста (core-modules §3): общая точка для main и renderer.
export const PING_CHANNEL = 'app:ping';
export const AUTH_STATUS_CHANNEL = 'auth:status';
export const AUTH_CREATE_OWNER_CHANNEL = 'auth:create-owner';
export const AUTH_LOGIN_CHANNEL = 'auth:login';
export const AUTH_LOGOUT_CHANNEL = 'auth:logout';

export interface PingResult {
  ok: true;
  version: string;
}

export type ProfileRole = 'owner' | 'member';

/** Публичная часть профиля: хеш пароля через IPC не передаётся (ADR-0006). */
export interface ProfileDto {
  id: string;
  name: string;
  role: ProfileRole;
}

export interface AuthStatusResult {
  needsOwner: boolean;
  profile: ProfileDto | null;
}

export interface CreateOwnerInput {
  name: string;
  password: string;
}

/** В v1 профиль один; имя владельца main берёт из файла данных. */
export interface LoginInput {
  password: string;
}

export interface SessionDto {
  sessionId: string;
  profile: ProfileDto;
}

export type IpcErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'STORAGE_FAILURE';

/** Безопасная для пользователя ошибка: те же поля, что у AppError (core-modules §6). */
export interface IpcErrorShape {
  code: IpcErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  traceId: string;
}

/** Команда возвращает результат либо ошибку, а не бросает через IPC (core-modules §3). */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorShape };

/** API, которое preload выставляет в window.api; Node в renderer не доступен. */
export interface HousePaymentsApi {
  ping(): Promise<PingResult>;
  authStatus(): Promise<IpcResult<AuthStatusResult>>;
  createOwner(input: CreateOwnerInput): Promise<IpcResult<ProfileDto>>;
  login(input: LoginInput): Promise<IpcResult<SessionDto>>;
  logout(sessionId: string): Promise<IpcResult<null>>;
}
