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
const ABSOLUTE_PATH_RE =
  /(?:[A-Za-z]:\\|\/(?:Users|home|var|tmp|private|opt|mnt|Volumes)\/)[^\s'"`]+/g;

function safeMessage(message: string): string {
  return message.replace(ABSOLUTE_PATH_RE, '[path]').slice(0, MAX_MESSAGE_LENGTH);
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

/** Оборачивает неожиданную ошибку в AppError, скрывая пути и прочие детали. */
export function toAppError(error: unknown, traceId?: string): AppError {
  if (error instanceof AppError) return error;
  return new AppError({
    code: 'STORAGE_FAILURE',
    message: error instanceof Error ? error.message : 'Unexpected storage failure',
    ...(traceId === undefined ? {} : { traceId }),
  });
}
