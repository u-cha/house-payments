import type { AppDatabase } from '../../../infrastructure/db/connection.js';
import { withTransaction } from '../../../infrastructure/db/transaction.js';
import { systemClock, type Clock } from '../../../shared/clock.js';
import { AppError } from '../../../shared/errors.js';
import type { EventRecorder } from '../../../shared/events.js';
import { uuidv7 } from '../../../shared/ids.js';
import {
  DEFAULT_SHARE_BP,
  DEFAULT_TYPE_SORT_ORDER,
  MAX_ADDRESS_LENGTH,
  MAX_AREA_M2,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_SHARE_BP,
  MAX_TYPE_NAME_LENGTH,
  MIN_SHARE_BP,
  normalizeTypeName,
  type Property,
  type PropertyStatus,
  type PropertyType,
} from '../domain/property.js';
import {
  isSupplierKind,
  supplierNameKey,
  MAX_SUPPLIER_CONTACTS_LENGTH,
  MAX_SUPPLIER_NAME_LENGTH,
  MAX_SUPPLIER_NOTE_LENGTH,
  normalizeSupplierName,
  type Supplier,
  type SupplierKind,
} from '../domain/supplier.js';
import type { CatalogRepository, PropertyRecord, PropertyTypeRecord } from './catalog-ports.js';

export interface CatalogDeps {
  clock?: Clock;
  recorder: EventRecorder;
}

/**
 * Актор, от имени которого выполняется команда: id профиля из активной сессии.
 * Use case не знает, откуда он взялся, — сессию разрешает IPC-граница.
 */
export interface CatalogActor {
  profileId: string;
}

const AUDIT_ACTIONS = {
  created: 'property.create',
  updated: 'property.update',
  archived: 'property.archive',
  restored: 'property.restore',
} as const;

function auditAction(operation: keyof typeof AUDIT_ACTIONS): string {
  return AUDIT_ACTIONS[operation];
}

const SUPPLIER_AUDIT_ACTIONS = {
  created: 'supplier.create',
  updated: 'supplier.update',
  archived: 'supplier.archive',
  restored: 'supplier.restore',
} as const;

export interface CreatePropertyInput {
  /** Существующий тип; не нужен, если тип создаётся вместе с объектом. */
  typeId?: string | undefined;
  /** Черновик типа из формы: создаётся в транзакции сохранения объекта. */
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
  /** Черновик типа из формы: создаётся в транзакции сохранения объекта. */
  newTypeName?: string | undefined;
  label?: string | undefined;
  address?: string | undefined;
  areaM2?: number | null | undefined;
  shareBp?: number | undefined;
  note?: string | null | undefined;
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

export interface ListSuppliersFilter {
  query?: string | undefined;
  kind?: SupplierKind | undefined;
  includeArchived?: boolean | undefined;
}

export interface ListPropertiesFilter {
  status?: PropertyStatus | undefined;
  typeId?: string | undefined;
}

export interface Catalog {
  createProperty(actor: CatalogActor, input: CreatePropertyInput): PropertyRecord;
  updateProperty(actor: CatalogActor, input: UpdatePropertyInput): PropertyRecord;
  archiveProperty(actor: CatalogActor, id: string): PropertyRecord;
  restoreProperty(actor: CatalogActor, id: string): PropertyRecord;
  getProperty(id: string): PropertyRecord;
  listProperties(filter?: ListPropertiesFilter): PropertyRecord[];

  createPropertyType(input: CreatePropertyTypeInput): PropertyTypeRecord;
  updatePropertyType(input: UpdatePropertyTypeInput): PropertyTypeRecord;
  /** Удаляет тип, только если им не пользуется ни один объект (архивные тоже считаются). */
  deletePropertyType(actor: CatalogActor, id: string): PropertyTypeRecord;
  listPropertyTypes(input?: { includeArchived?: boolean | undefined }): PropertyTypeRecord[];

  createSupplier(actor: CatalogActor, input: CreateSupplierInput): Supplier;
  updateSupplier(actor: CatalogActor, input: UpdateSupplierInput): Supplier;
  archiveSupplier(actor: CatalogActor, id: string): Supplier;
  restoreSupplier(actor: CatalogActor, id: string): Supplier;
  getSupplier(id: string): Supplier;
  listSuppliers(filter?: ListSuppliersFilter): Supplier[];
  /** Все поставщики с тем же name_key: повод для предупреждения о дубле, не запрет. */
  findSuppliersByName(name: string): Supplier[];
}

function fail(message: string): AppError {
  return new AppError({ code: 'VALIDATION_FAILED', message });
}

function notFound(message: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message });
}

function conflict(message: string): AppError {
  return new AppError({ code: 'CONFLICT', message, details: { reason: 'DUPLICATE_TYPE_NAME' } });
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw fail(`${field}: ожидается строка`);
  const text = value.trim();
  if (text.length === 0) throw fail(`${field}: не может быть пустым`);
  if (text.length > maxLength) throw fail(`${field}: не длиннее ${maxLength} символов`);
  return text;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw fail(`${field}: ожидается строка`);
  const text = value.trim();
  if (text.length > maxLength) throw fail(`${field}: не длиннее ${maxLength} символов`);
  return text === '' ? null : text;
}

function areaM2(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw fail('Площадь: ожидается число');
  }
  if (value <= 0 || value > MAX_AREA_M2) {
    throw fail(`Площадь: больше 0 и не больше ${MAX_AREA_M2} м²`);
  }
  return Math.round(value * 100) / 100;
}

function shareBp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw fail('Доля владения: ожидается целое число в базисных пунктах');
  }
  if (value < MIN_SHARE_BP || value > MAX_SHARE_BP) {
    throw fail(`Доля владения: от ${MIN_SHARE_BP} до ${MAX_SHARE_BP} базисных пунктов`);
  }
  return value;
}

function typeSortOrder(value: unknown): number {
  if (value === undefined) return DEFAULT_TYPE_SORT_ORDER;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw fail('Порядок типа: целое неотрицательное число');
  }
  return value;
}

function recordProperty(
  deps: CatalogDeps,
  actor: CatalogActor,
  property: Property,
  operation: 'created' | 'updated' | 'archived' | 'restored',
): void {
  // payload без адреса и заметки: персональные данные не уходят в журнал.
  deps.recorder.recordChange({
    entityType: 'property',
    entityId: property.id,
    operation,
    payload: { label: property.label, typeId: property.typeId, status: property.status },
  });
  // Аудит — от профиля из сессии (INV-17): «кто» и «что» в одной транзакции.
  deps.recorder.recordAudit({
    profileId: actor.profileId,
    action: auditAction(operation),
    entityType: 'property',
    entityId: property.id,
    details: { typeId: property.typeId, status: property.status },
  });
}

function recordSupplier(
  deps: CatalogDeps,
  actor: CatalogActor,
  supplier: Supplier,
  operation: 'created' | 'updated' | 'archived' | 'restored',
): void {
  // Контакты и заметка — персональные данные и свободный текст: в журнал не уходят.
  deps.recorder.recordChange({
    entityType: 'supplier',
    entityId: supplier.id,
    operation,
    payload: { name: supplier.name, kind: supplier.kind, isActive: supplier.isActive },
  });
  deps.recorder.recordAudit({
    profileId: actor.profileId,
    action: SUPPLIER_AUDIT_ACTIONS[operation],
    entityType: 'supplier',
    entityId: supplier.id,
    details: { kind: supplier.kind, isActive: supplier.isActive },
  });
}

function supplierKind(value: unknown): SupplierKind {
  if (!isSupplierKind(value)) throw fail('Тип поставщика: uk, tsj, rso или other');
  return value;
}

function recordPropertyType(
  deps: CatalogDeps,
  type: PropertyType,
  operation: 'created' | 'updated' | 'deleted',
): void {
  deps.recorder.recordChange({
    entityType: 'property_type',
    entityId: type.id,
    operation,
    payload: { name: type.name, isActive: type.isActive },
  });
}

/**
 * Use cases каталога «объекты» (core-modules §4): объект, его тип и архив.
 * Состояние и `change_log` пишутся одной транзакцией (ADR-0005); чужие таблицы
 * модуль не читает — только свой порт и `EventRecorder`.
 */
export function createCatalogService(
  db: AppDatabase,
  repo: CatalogRepository,
  deps: CatalogDeps,
): Catalog {
  const clock = deps.clock ?? systemClock;

  const requireProperty = (id: string): PropertyRecord => {
    const property = repo.findProperty(requiredText(id, 'Идентификатор объекта', 100));
    if (property === undefined) throw notFound('Объект не найден');
    return property;
  };

  const requireSupplier = (id: string): Supplier => {
    const supplier = repo.findSupplier(requiredText(id, 'Идентификатор поставщика', 100));
    if (supplier === undefined) throw notFound('Поставщик не найден');
    return supplier;
  };

  const setSupplierActive = (actor: CatalogActor, current: Supplier, isActive: boolean): Supplier =>
    withTransaction(db, () => {
      if (current.isActive === isActive) return current;
      const next: Supplier = { ...current, isActive, updatedAt: clock.now().toISOString() };
      repo.updateSupplier(next);
      recordSupplier(deps, actor, next, isActive ? 'restored' : 'archived');
      return repo.findSupplier(next.id) ?? next;
    });

  const requireType = (id: string): PropertyTypeRecord => {
    const type = repo.findPropertyType(requiredText(id, 'Идентификатор типа', 100));
    if (type === undefined) throw notFound('Тип объекта не найден');
    return type;
  };

  const requireActiveType = (id: string): PropertyTypeRecord => {
    const type = requireType(id);
    if (!type.isActive) {
      throw fail('Тип объекта скрыт из выбора: выберите другой или верните его в справочник');
    }
    return type;
  };

  const setStatus = (
    actor: CatalogActor,
    current: PropertyRecord,
    status: PropertyStatus,
  ): PropertyRecord =>
    withTransaction(db, () => {
      if (current.status === status) return current;
      const next: Property = { ...current, status };
      repo.updateProperty(next);
      recordProperty(deps, actor, next, status === 'archived' ? 'archived' : 'restored');
      return repo.findProperty(next.id) ?? { ...next, typeName: current.typeName };
    });

  /**
   * Тип для записи объекта. Черновик из формы (`newTypeName`) создаётся в этой же
   * транзакции: закрытие листа без сохранения или ошибка записи не оставляют тип
   * в справочнике. Одноимённый тип переиспользуется, скрытый — возвращается в выбор.
   */
  const resolvePropertyType = (
    typeId: string | undefined,
    newTypeName: string | undefined,
  ): PropertyTypeRecord => {
    if (newTypeName !== undefined) {
      const name = normalizeTypeName(
        requiredText(newTypeName, 'Название типа', MAX_TYPE_NAME_LENGTH),
      );
      const existing = repo.findPropertyTypeByName(name);
      if (existing !== undefined) {
        if (existing.isActive) return existing;
        const revived: PropertyTypeRecord = { ...existing, isActive: true };
        repo.updatePropertyType(revived);
        recordPropertyType(deps, revived, 'updated');
        return revived;
      }
      const created: PropertyType = {
        id: uuidv7(),
        name,
        sortOrder: DEFAULT_TYPE_SORT_ORDER,
        isActive: true,
        createdAt: clock.now().toISOString(),
      };
      repo.insertPropertyType(created);
      recordPropertyType(deps, created, 'created');
      return { ...created, usageCount: 0, activeCount: 0, archivedCount: 0, usedBy: [] };
    }
    if (typeId === undefined) throw fail('Выберите тип объекта');
    return requireActiveType(typeId);
  };

  /**
   * Дополняет тип сведениями об использовании: справочник показывает их в
   * колонке «Задействован» и раскрывает список объектов по клику.
   */
  const withUsage = (type: PropertyTypeRecord): PropertyTypeRecord => {
    const used = repo.listPropertiesByType(type.id);
    return {
      ...type,
      usageCount: used.length,
      activeCount: used.filter((property) => property.status === 'active').length,
      archivedCount: used.filter((property) => property.status === 'archived').length,
      usedBy: used.map((property) =>
        property.status === 'archived' ? `${property.label} (в архиве)` : property.label,
      ),
    };
  };

  const failureInUse = (type: PropertyTypeRecord, used: PropertyRecord[]): AppError => {
    const shown = used.slice(0, 5).map((property) => {
      const suffix = property.status === 'archived' ? ' (в архиве)' : '';
      return `«${property.label}»${suffix}`;
    });
    const rest = used.length > shown.length ? ` и ещё ${used.length - shown.length}` : '';
    return new AppError({
      code: 'BUSINESS_RULE',
      message:
        `Тип «${type.name}» используют объекты (${used.length}): ` +
        `${shown.join(', ')}${rest}. ` +
        'Удалить можно только тип, который не используется (архивные объекты тоже считаются).',
      details: {
        reason: 'TYPE_IN_USE',
        propertyCount: used.length,
        properties: used
          .slice(0, 5)
          .map((property) => ({ id: property.id, label: property.label, status: property.status })),
      },
      retryable: false,
    });
  };

  return {
    createProperty(actor, input) {
      const values = {
        id: uuidv7(),
        label: requiredText(input.label, 'Название объекта', MAX_LABEL_LENGTH),
        address: requiredText(input.address, 'Адрес', MAX_ADDRESS_LENGTH),
        areaM2: areaM2(input.areaM2),
        shareBp: input.shareBp === undefined ? DEFAULT_SHARE_BP : shareBp(input.shareBp),
        note: optionalText(input.note, 'Заметка', MAX_NOTE_LENGTH),
        status: 'active' as const,
        createdAt: clock.now().toISOString(),
      };
      return withTransaction(db, () => {
        // Тип-черновик рождается здесь же: отказ от формы или ошибка сохранения
        // откатывают и объект, и тип (S-05, замечание пользователя).
        const type = resolvePropertyType(input.typeId, input.newTypeName);
        const property: Property = { ...values, typeId: type.id };
        repo.insertProperty(property);
        recordProperty(deps, actor, property, 'created');
        return repo.findProperty(property.id) ?? { ...property, typeName: type.name };
      });
    },

    updateProperty(actor, input) {
      return withTransaction(db, () => {
        const current = requireProperty(input.id);
        // Параметры архивного объекта меняются только после возврата в активные:
        // иначе объект «оживает» в истории незаметно для списка.
        if (current.status === 'archived') {
          throw new AppError({
            code: 'BUSINESS_RULE',
            message: 'Верните объект в активные, чтобы изменить его параметры',
            details: { reason: 'PROPERTY_ARCHIVED' },
            retryable: false,
          });
        }
        const typeEdited = input.typeId !== undefined || input.newTypeName !== undefined;
        const next: Property = {
          ...current,
          typeId: typeEdited
            ? resolvePropertyType(input.typeId, input.newTypeName).id
            : current.typeId,
          label:
            input.label === undefined
              ? current.label
              : requiredText(input.label, 'Название объекта', MAX_LABEL_LENGTH),
          address:
            input.address === undefined
              ? current.address
              : requiredText(input.address, 'Адрес', MAX_ADDRESS_LENGTH),
          areaM2: input.areaM2 === undefined ? current.areaM2 : areaM2(input.areaM2),
          shareBp: input.shareBp === undefined ? current.shareBp : shareBp(input.shareBp),
          note:
            input.note === undefined
              ? current.note
              : optionalText(input.note, 'Заметка', MAX_NOTE_LENGTH),
        };
        const changed =
          next.typeId !== current.typeId ||
          next.label !== current.label ||
          next.address !== current.address ||
          next.areaM2 !== current.areaM2 ||
          next.shareBp !== current.shareBp ||
          next.note !== current.note;
        if (!changed) return current;
        repo.updateProperty(next);
        recordProperty(deps, actor, next, 'updated');
        return repo.findProperty(next.id) ?? { ...next, typeName: current.typeName };
      });
    },

    archiveProperty(actor, id) {
      return setStatus(actor, requireProperty(id), 'archived');
    },

    restoreProperty(actor, id) {
      return setStatus(actor, requireProperty(id), 'active');
    },

    getProperty(id) {
      return requireProperty(id);
    },

    listProperties(filter = {}) {
      const status: PropertyStatus = filter.status ?? 'active';
      if (status !== 'active' && status !== 'archived') {
        throw fail('Статус объекта: active или archived');
      }
      const typeId =
        filter.typeId === undefined ? undefined : requiredText(filter.typeId, 'Тип объекта', 100);
      return repo.listProperties({ status, ...(typeId === undefined ? {} : { typeId }) });
    },

    createPropertyType(input) {
      const now = clock.now().toISOString();
      const type: PropertyType = {
        id: uuidv7(),
        // Название типа хранится в нижнем регистре: единое написание на всех экранах.
        name: normalizeTypeName(requiredText(input.name, 'Название типа', MAX_TYPE_NAME_LENGTH)),
        sortOrder: typeSortOrder(input.sortOrder),
        isActive: true,
        createdAt: now,
      };
      return withTransaction(db, () => {
        if (repo.findPropertyTypeByName(type.name) !== undefined) {
          throw conflict('Тип с таким названием уже есть');
        }
        repo.insertPropertyType(type);
        recordPropertyType(deps, type, 'created');
        return { ...type, usageCount: 0, activeCount: 0, archivedCount: 0, usedBy: [] };
      });
    },

    updatePropertyType(input) {
      return withTransaction(db, () => {
        const current = requireType(input.id);
        const name =
          input.name === undefined
            ? current.name
            : normalizeTypeName(requiredText(input.name, 'Название типа', MAX_TYPE_NAME_LENGTH));
        if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
          throw fail('Признак активности типа: ожидается true или false');
        }
        const isActive = input.isActive ?? current.isActive;
        if (name === current.name && isActive === current.isActive) return current;
        if (name !== current.name && repo.findPropertyTypeByName(name, current.id) !== undefined) {
          throw conflict('Тип с таким названием уже есть');
        }
        const next: PropertyTypeRecord = { ...current, name, isActive };
        repo.updatePropertyType(next);
        recordPropertyType(deps, next, 'updated');
        return withUsage(next);
      });
    },

    deletePropertyType(actor, id) {
      return withTransaction(db, () => {
        const type = requireType(id);
        const used = repo.listPropertiesByType(type.id);
        // FKs включены, поэтому без проверки SQLite дал бы непонятную ошибку:
        // сначала объясняем, какие объекты мешают, и только потом удаляем.
        if (used.length > 0) throw failureInUse(type, used);
        repo.deletePropertyType(type.id);
        recordPropertyType(deps, type, 'deleted');
        deps.recorder.recordAudit({
          profileId: actor.profileId,
          action: 'property.type.delete',
          entityType: 'property_type',
          entityId: type.id,
          details: { name: type.name },
        });
        return type;
      });
    },

    listPropertyTypes(input = {}) {
      return repo.listPropertyTypes(input.includeArchived === true).map(withUsage);
    },

    createSupplier(actor, input) {
      const now = clock.now().toISOString();
      const name = normalizeSupplierName(
        requiredText(input.name, 'Название поставщика', MAX_SUPPLIER_NAME_LENGTH),
      );
      const supplier: Supplier = {
        id: uuidv7(),
        name,
        nameKey: supplierNameKey(name),
        kind: supplierKind(input.kind),
        contacts: optionalText(input.contacts, 'Контакты', MAX_SUPPLIER_CONTACTS_LENGTH),
        note: optionalText(input.note, 'Заметка', MAX_SUPPLIER_NOTE_LENGTH),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      // Дубль не запрещён (R-13): вставка идёт как есть, UI предупреждает.
      return withTransaction(db, () => {
        repo.insertSupplier(supplier);
        recordSupplier(deps, actor, supplier, 'created');
        return repo.findSupplier(supplier.id) ?? supplier;
      });
    },

    updateSupplier(actor, input) {
      return withTransaction(db, () => {
        const current = requireSupplier(input.id);
        if (!current.isActive) {
          throw new AppError({
            code: 'BUSINESS_RULE',
            message: 'Верните поставщика в активные, чтобы изменить его данные',
            details: { reason: 'SUPPLIER_ARCHIVED' },
            retryable: false,
          });
        }
        const name =
          input.name === undefined
            ? current.name
            : normalizeSupplierName(
                requiredText(input.name, 'Название поставщика', MAX_SUPPLIER_NAME_LENGTH),
              );
        const next: Supplier = {
          ...current,
          name,
          nameKey: supplierNameKey(name),
          kind: input.kind === undefined ? current.kind : supplierKind(input.kind),
          contacts:
            input.contacts === undefined
              ? current.contacts
              : optionalText(input.contacts, 'Контакты', MAX_SUPPLIER_CONTACTS_LENGTH),
          note:
            input.note === undefined
              ? current.note
              : optionalText(input.note, 'Заметка', MAX_SUPPLIER_NOTE_LENGTH),
        };
        const changed =
          next.name !== current.name ||
          next.kind !== current.kind ||
          next.contacts !== current.contacts ||
          next.note !== current.note;
        if (!changed) return current;
        next.updatedAt = clock.now().toISOString();
        repo.updateSupplier(next);
        recordSupplier(deps, actor, next, 'updated');
        return repo.findSupplier(next.id) ?? next;
      });
    },

    archiveSupplier(actor, id) {
      return setSupplierActive(actor, requireSupplier(id), false);
    },

    restoreSupplier(actor, id) {
      return setSupplierActive(actor, requireSupplier(id), true);
    },

    getSupplier(id) {
      return requireSupplier(id);
    },

    listSuppliers(filter = {}) {
      if (filter.kind !== undefined && !isSupplierKind(filter.kind)) {
        throw fail('Тип поставщика: uk, tsj, rso или other');
      }
      if (filter.includeArchived !== undefined && typeof filter.includeArchived !== 'boolean') {
        throw fail('Признак архива: ожидается true или false');
      }
      if (filter.query !== undefined && typeof filter.query !== 'string') {
        throw fail('Поиск: ожидается строка');
      }
      const query = filter.query === undefined ? '' : supplierNameKey(filter.query);
      return repo.listSuppliers({
        includeArchived: filter.includeArchived === true,
        ...(filter.kind === undefined ? {} : { kind: filter.kind }),
        ...(query === '' ? {} : { query }),
      });
    },

    findSuppliersByName(name) {
      if (typeof name !== 'string') throw fail('Название для поиска дубля: ожидается строка');
      const nameKey = supplierNameKey(name);
      if (nameKey === '') return [];
      return repo.findSuppliersByName(nameKey);
    },
  };
}
