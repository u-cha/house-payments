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

export interface CreatePropertyInput {
  typeId: string;
  label: string;
  address: string;
  areaM2?: number | null | undefined;
  shareBp?: number | undefined;
  note?: string | null | undefined;
}

export interface UpdatePropertyInput {
  id: string;
  typeId?: string | undefined;
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
  listPropertyTypes(input?: { includeArchived?: boolean | undefined }): PropertyTypeRecord[];
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

function recordPropertyType(
  deps: CatalogDeps,
  type: PropertyType,
  operation: 'created' | 'updated',
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

  return {
    createProperty(actor, input) {
      const property: Property = {
        id: uuidv7(),
        typeId: requiredText(input.typeId, 'Тип объекта', 100),
        label: requiredText(input.label, 'Название объекта', MAX_LABEL_LENGTH),
        address: requiredText(input.address, 'Адрес', MAX_ADDRESS_LENGTH),
        areaM2: areaM2(input.areaM2),
        shareBp: input.shareBp === undefined ? DEFAULT_SHARE_BP : shareBp(input.shareBp),
        note: optionalText(input.note, 'Заметка', MAX_NOTE_LENGTH),
        status: 'active',
        createdAt: clock.now().toISOString(),
      };
      return withTransaction(db, () => {
        const type = requireActiveType(property.typeId);
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
        const next: Property = {
          ...current,
          typeId:
            input.typeId === undefined
              ? current.typeId
              : requiredText(input.typeId, 'Тип объекта', 100),
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
        if (next.typeId !== current.typeId) requireActiveType(next.typeId);
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
        return type;
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
        const next: PropertyType = { ...current, name, isActive };
        repo.updatePropertyType(next);
        recordPropertyType(deps, next, 'updated');
        return next;
      });
    },

    listPropertyTypes(input = {}) {
      return repo.listPropertyTypes(input.includeArchived === true);
    },
  };
}
