import type {
  AuthStatusResult,
  CreateOwnerInput,
  CreatePropertyInput,
  CreatePropertyTypeInput,
  IpcErrorCode,
  IpcErrorShape,
  IpcResult,
  ListPropertiesInput,
  ListPropertyTypesInput,
  LoginInput,
  ProfileDto,
  PropertyDto,
  PropertyTypeDto,
  SessionDto,
  UpdatePropertyInput,
  UpdatePropertyTypeInput,
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

  // Команды каталога выполняются в контексте сессии: sessionId обязателен.
  listPropertyTypes: (
    sessionId: string,
    input?: ListPropertyTypesInput,
  ): Promise<PropertyTypeDto[]> => unwrap(window.api.listPropertyTypes(sessionId, input)),
  createPropertyType: (
    sessionId: string,
    input: CreatePropertyTypeInput,
  ): Promise<PropertyTypeDto> => unwrap(window.api.createPropertyType(sessionId, input)),
  updatePropertyType: (
    sessionId: string,
    input: UpdatePropertyTypeInput,
  ): Promise<PropertyTypeDto> => unwrap(window.api.updatePropertyType(sessionId, input)),
  createProperty: (sessionId: string, input: CreatePropertyInput): Promise<PropertyDto> =>
    unwrap(window.api.createProperty(sessionId, input)),
  updateProperty: (sessionId: string, input: UpdatePropertyInput): Promise<PropertyDto> =>
    unwrap(window.api.updateProperty(sessionId, input)),
  archiveProperty: (sessionId: string, id: string): Promise<PropertyDto> =>
    unwrap(window.api.archiveProperty(sessionId, id)),
  restoreProperty: (sessionId: string, id: string): Promise<PropertyDto> =>
    unwrap(window.api.restoreProperty(sessionId, id)),
  getProperty: (sessionId: string, id: string): Promise<PropertyDto> =>
    unwrap(window.api.getProperty(sessionId, id)),
  listProperties: (sessionId: string, input?: ListPropertiesInput): Promise<PropertyDto[]> =>
    unwrap(window.api.listProperties(sessionId, input)),
};

export function toUiError(error: unknown): UiError {
  if (error instanceof IpcError) return { message: error.message, code: error.code };
  return { message: 'Не удалось выполнить операцию. Повторите попытку.', code: 'UNKNOWN' };
}
