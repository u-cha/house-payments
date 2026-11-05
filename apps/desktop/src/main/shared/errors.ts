import { uuidv7 } from './ids.js';

// Единая модель ошибок (core-modules §6): код, безопасное сообщение, retryable, traceId.
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'STORAGE_FAILURE';

export interface AppErrorShape {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  traceId: string;
}

export type AppErrorInput = Pick<AppErrorShape, 'code' | 'message'> &
  Partial<Pick<AppErrorShape, 'details' | 'retryable' | 'traceId'>>;

const MAX_MESSAGE_LENGTH = 500;
const UNEXPECTED_ERROR_MESSAGE = 'Внутренняя ошибка приложения';
const EMPTY_STORAGE_MESSAGE = 'Ошибка файла данных или диска';

// Редактирование PII перед показом пользователю (core-modules §6, C-04).
// Порядок важен: сначала пути и токены, затем e-mail и телефоны.
const FILE_URL_RE = /file:\/\/[^\s'"`]+/gi;
const ABSOLUTE_PATH_RE =
  /(?:[A-Za-z]:\\|\/(?:Users|home|root|var|tmp|private|opt|mnt|Volumes|Applications|Library|System|srv|etc|usr|run|snap|nix)\/)[^\s'"`]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const API_KEY_RE = /\b(?:sk|pk|rk|ghp|gho|ghs|ghr|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g;
const LONG_SECRET_RE = /\b[0-9a-f]{40,}\b/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g;

function safeMessage(message: string): string {
  const redacted = message
    .replace(FILE_URL_RE, '[path]')
    .replace(ABSOLUTE_PATH_RE, '[path]')
    .replace(BEARER_RE, 'Bearer [token]')
    .replace(JWT_RE, '[token]')
    .replace(API_KEY_RE, '[token]')
    .replace(LONG_SECRET_RE, '[token]')
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]');
  // Резка по code points, чтобы не разорвать суррогатную пару.
  return [...redacted].slice(0, MAX_MESSAGE_LENGTH).join('');
}

// Сбои файла данных/диска, после которых окружение может восстановиться (core-modules §6).
const STORAGE_ERRNO_CODES = new Set([
  'EACCES',
  'EAGAIN',
  'EBUSY',
  'EDQUOT',
  'EEXIST',
  'EIO',
  'EISDIR',
  'EMFILE',
  'ENAMETOOLONG',
  'ENFILE',
  'ENODEV',
  'ENOENT',
  'ENOSPC',
  'ENOTDIR',
  'ENOTEMPTY',
  'EROFS',
  'ESTALE',
  'ETIMEDOUT',
  'EXDEV',
]);

const STORAGE_SQLITE_CODES = new Set([
  'SQLITE_BUSY',
  'SQLITE_CANTOPEN',
  'SQLITE_CORRUPT',
  'SQLITE_FULL',
  'SQLITE_IOERR',
  'SQLITE_LOCKED',
  'SQLITE_NOTADB',
  'SQLITE_PROTOCOL',
]);

function storageFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return (
    STORAGE_ERRNO_CODES.has(code) ||
    STORAGE_SQLITE_CODES.has(code) ||
    code.startsWith('SQLITE_IOERR_')
  );
}

export class AppError extends Error implements AppErrorShape {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly traceId: string;

  constructor(input: AppErrorInput) {
    super(safeMessage(input.message));
    this.name = 'AppError';
    this.code = input.code;
    this.retryable =
      input.retryable ??
      (input.code === 'STORAGE_FAILURE' || input.details?.['reason'] === 'CONCURRENT_MODIFICATION');
    this.traceId = input.traceId ?? uuidv7();
    if (input.details !== undefined) this.details = input.details;
  }

  toJSON(): AppErrorShape {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      traceId: this.traceId,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Маппинг неизвестных ошибок на границе IPC (core-modules §6):
 *
 * 1. `AppError` возвращается без изменений — код и `traceId` уже выставлены.
 * 2. Системный сбой файла данных/диска (`errno`: ENOSPC, EIO, EBUSY, ENOENT, …
 *    или SQLite: SQLITE_BUSY, SQLITE_IOERR*, …) → `STORAGE_FAILURE`, `retryable: true`:
 *    сбой среды, повтор после устранения причины может помочь.
 * 3. Всё остальное (TypeError, RangeError, `Error` без кода, throw не-Error) —
 *    программная ошибка → ближайший неретраибельный код из закрытого списка §6
 *    `BUSINESS_RULE`, `retryable: false`: повтор того же вызова не поможет.
 *    Сырой текст наружу не отдаётся (может содержать PII и внутренние детали);
 *    диагностика — по `traceId` в журнале main-процесса.
 */
export function toAppError(error: unknown, traceId?: string): AppError {
  if (error instanceof AppError) return error;

  const trace = traceId === undefined ? {} : { traceId };
  if (storageFailure(error)) {
    const raw = error instanceof Error ? error.message : '';
    return new AppError({
      code: 'STORAGE_FAILURE',
      message: raw.trim() === '' ? EMPTY_STORAGE_MESSAGE : raw,
      ...trace,
    });
  }

  return new AppError({
    code: 'BUSINESS_RULE',
    message: UNEXPECTED_ERROR_MESSAGE,
    ...trace,
  });
}
