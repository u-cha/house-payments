// Контракт IPC-моста (core-modules §3): общая точка для main и renderer.
export const PING_CHANNEL = 'app:ping';
export const AUTH_STATUS_CHANNEL = 'auth:status';
export const AUTH_CREATE_OWNER_CHANNEL = 'auth:create-owner';
export const AUTH_LOGIN_CHANNEL = 'auth:login';
export const AUTH_LOGOUT_CHANNEL = 'auth:logout';
export const APP_QUIT_CHANNEL = 'app:quit';
export const CATALOG_LIST_PROPERTY_TYPES_CHANNEL = 'catalog:property-type:list';
export const CATALOG_CREATE_PROPERTY_TYPE_CHANNEL = 'catalog:property-type:create';
export const CATALOG_UPDATE_PROPERTY_TYPE_CHANNEL = 'catalog:property-type:update';
export const CATALOG_DELETE_PROPERTY_TYPE_CHANNEL = 'catalog:property-type:delete';
export const CATALOG_CREATE_PROPERTY_CHANNEL = 'catalog:property:create';
export const CATALOG_UPDATE_PROPERTY_CHANNEL = 'catalog:property:update';
export const CATALOG_ARCHIVE_PROPERTY_CHANNEL = 'catalog:property:archive';
export const CATALOG_RESTORE_PROPERTY_CHANNEL = 'catalog:property:restore';
export const CATALOG_GET_PROPERTY_CHANNEL = 'catalog:property:get';
export const CATALOG_LIST_PROPERTIES_CHANNEL = 'catalog:properties:list';
export const CATALOG_CREATE_SUPPLIER_CHANNEL = 'catalog:supplier:create';
export const CATALOG_UPDATE_SUPPLIER_CHANNEL = 'catalog:supplier:update';
export const CATALOG_ARCHIVE_SUPPLIER_CHANNEL = 'catalog:supplier:archive';
export const CATALOG_RESTORE_SUPPLIER_CHANNEL = 'catalog:supplier:restore';
export const CATALOG_GET_SUPPLIER_CHANNEL = 'catalog:supplier:get';
export const CATALOG_LIST_SUPPLIERS_CHANNEL = 'catalog:suppliers:list';
export const CATALOG_FIND_SUPPLIERS_BY_NAME_CHANNEL = 'catalog:suppliers:find-by-name';

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

/** Снаружи — «объект»; в контракте и схеме — property (см. entities.md §2). */
export type PropertyStatus = 'active' | 'archived';

export interface PropertyTypeDto {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  /** Сколько объектов (активных и архивных) ссылаются на тип: удаление разрешено при 0. */
  usageCount: number;
  /** Из них активных. */
  activeCount: number;
  /** Из них архивных (тоже считаются использованием). */
  archivedCount: number;
  /** Названия всех объектов, которые используют тип (архивные помечены). */
  usedBy?: string[];
}

export interface PropertyDto {
  id: string;
  typeId: string;
  typeName: string;
  label: string;
  address: string;
  areaM2: number | null;
  shareBp: number;
  note: string | null;
  status: PropertyStatus;
  createdAt: string;
}

/** Тип поставщика: УК, ТСЖ, РСО или другая организация (entities.md §2). */
export type SupplierKind = 'uk' | 'tsj' | 'rso' | 'other';

export interface SupplierDto {
  id: string;
  name: string;
  /** Ключ сравнения названий: trim + нижний регистр; дубли разрешены (R-13). */
  nameKey: string;
  kind: SupplierKind;
  contacts: string | null;
  note: string | null;
  /** false — в архиве: скрыт из выбора, но остаётся в истории. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListSuppliersInput {
  /** Поиск по названию без учёта регистра. */
  query?: string | undefined;
  kind?: SupplierKind | undefined;
  includeArchived?: boolean | undefined;
}

export interface CreateSupplierInput {
  name: string;
  kind: SupplierKind;
  contacts?: string | null | undefined;
  note?: string | null | undefined;
}

export interface UpdateSupplierInput {
  id: string;
  name?: string | undefined;
  kind?: SupplierKind | undefined;
  contacts?: string | null | undefined;
  note?: string | null | undefined;
}

export interface ListPropertyTypesInput {
  includeArchived?: boolean | undefined;
}

export interface CreatePropertyTypeInput {
  name: string;
  sortOrder?: number | undefined;
}

export interface UpdatePropertyTypeInput {
  id: string;
  name?: string | undefined;
  isActive?: boolean | undefined;
}

export interface CreatePropertyInput {
  /** Существующий тип; не указывается, если тип создаётся вместе с объектом. */
  typeId?: string | undefined;
  /** Черновик типа из формы: main создаст его в той же транзакции, что и объект. */
  newTypeName?: string | undefined;
  label: string;
  address: string;
  areaM2?: number | null | undefined;
  shareBp?: number | undefined;
  note?: string | null | undefined;
}

export interface UpdatePropertyInput {
  id: string;
  typeId?: string | undefined;
  /** Черновик типа из формы: создаётся вместе с сохранением объекта. */
  newTypeName?: string | undefined;
  label?: string | undefined;
  address?: string | undefined;
  areaM2?: number | null | undefined;
  shareBp?: number | undefined;
  note?: string | null | undefined;
}

export interface ListPropertiesInput {
  status?: PropertyStatus | undefined;
  typeId?: string | undefined;
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
  /** Полное завершение приложения: exit процесса, а не возврат на экран входа. */
  quit(): void;

  // Команды каталога выполняются только в контексте активной сессии (core-modules §3):
  // renderer передаёт sessionId, main отвечает UNAUTHENTICATED без активной сессии.
  listPropertyTypes(
    sessionId: string,
    input?: ListPropertyTypesInput,
  ): Promise<IpcResult<PropertyTypeDto[]>>;
  createPropertyType(
    sessionId: string,
    input: CreatePropertyTypeInput,
  ): Promise<IpcResult<PropertyTypeDto>>;
  updatePropertyType(
    sessionId: string,
    input: UpdatePropertyTypeInput,
  ): Promise<IpcResult<PropertyTypeDto>>;
  deletePropertyType(sessionId: string, id: string): Promise<IpcResult<null>>;
  createProperty(sessionId: string, input: CreatePropertyInput): Promise<IpcResult<PropertyDto>>;
  updateProperty(sessionId: string, input: UpdatePropertyInput): Promise<IpcResult<PropertyDto>>;
  archiveProperty(sessionId: string, id: string): Promise<IpcResult<PropertyDto>>;
  restoreProperty(sessionId: string, id: string): Promise<IpcResult<PropertyDto>>;
  getProperty(sessionId: string, id: string): Promise<IpcResult<PropertyDto>>;
  listProperties(sessionId: string, input?: ListPropertiesInput): Promise<IpcResult<PropertyDto[]>>;

  createSupplier(sessionId: string, input: CreateSupplierInput): Promise<IpcResult<SupplierDto>>;
  updateSupplier(sessionId: string, input: UpdateSupplierInput): Promise<IpcResult<SupplierDto>>;
  archiveSupplier(sessionId: string, id: string): Promise<IpcResult<SupplierDto>>;
  restoreSupplier(sessionId: string, id: string): Promise<IpcResult<SupplierDto>>;
  getSupplier(sessionId: string, id: string): Promise<IpcResult<SupplierDto>>;
  listSuppliers(sessionId: string, input?: ListSuppliersInput): Promise<IpcResult<SupplierDto[]>>;
  /** Дубли названий разрешены: предупреждение в UI, а не запрет (R-13). */
  findSuppliersByName(sessionId: string, name: string): Promise<IpcResult<SupplierDto[]>>;
}
