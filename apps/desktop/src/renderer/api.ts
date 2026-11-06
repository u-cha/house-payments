import type {
  AuthStatusResult,
  CreateOwnerInput,
  IpcErrorCode,
  IpcErrorShape,
  IpcResult,
  LoginInput,
  ProfileDto,
  SessionDto,
} from '../shared/ipc';

/** Ошибка main-процесса в renderer: поля AppError сохранены (core-modules §6). */
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly retryable: boolean;
  readonly traceId: string;

  constructor(shape: IpcErrorShape) {
    super(shape.message);
    this.name = 'IpcError';
    this.code = shape.code;
    this.retryable = shape.retryable;
    this.traceId = shape.traceId;
  }
}

export interface UiError {
  message: string;
  code: IpcErrorCode | 'UNKNOWN';
}

/** Разворачивает ответ моста: успех → данные, отказ → IpcError для UI. */
async function unwrap<T>(call: Promise<IpcResult<T>>): Promise<T> {
  const result = await call;
  if (result.ok) return result.data;
  throw new IpcError(result.error);
}

/** Типизированный клиент window.api: renderer не знает про каналы и Electron. */
export const api = {
  status: (): Promise<AuthStatusResult> => unwrap(window.api.authStatus()),
  createOwner: (input: CreateOwnerInput): Promise<ProfileDto> =>
    unwrap(window.api.createOwner(input)),
  login: (input: LoginInput): Promise<SessionDto> => unwrap(window.api.login(input)),
  logout: (sessionId: string): Promise<null> => unwrap(window.api.logout(sessionId)),
  /** Полный выход: main завершает процесс, возврата на экран входа нет. */
  quit: (): void => window.api.quit(),
};

export function toUiError(error: unknown): UiError {
  if (error instanceof IpcError) return { message: error.message, code: error.code };
  return { message: 'Не удалось выполнить операцию. Повторите попытку.', code: 'UNKNOWN' };
}
