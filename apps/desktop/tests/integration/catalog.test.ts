import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_ARCHIVE_PROPERTY_CHANNEL,
  CATALOG_CREATE_PROPERTY_CHANNEL,
  CATALOG_CREATE_PROPERTY_TYPE_CHANNEL,
  CATALOG_DELETE_PROPERTY_TYPE_CHANNEL,
  CATALOG_LIST_PROPERTIES_CHANNEL,
  CATALOG_LIST_PROPERTY_TYPES_CHANNEL,
  CATALOG_RESTORE_PROPERTY_CHANNEL,
  CATALOG_UPDATE_PROPERTY_CHANNEL,
} from '../../src/shared/ipc.js';
import {
  createEventRecorder,
  openAppDatabase,
  type AppDatabase,
} from '../../src/main/infrastructure/db/index.js';
import { registerCatalog } from '../../src/main/ipc/catalog.js';
import {
  createCatalog,
  type Catalog,
  type CatalogActor,
  type CatalogDeps,
} from '../../src/main/modules/catalog/api.js';
import { InMemorySessionStore } from '../../src/main/modules/identity/api.js';
import { FixedClock } from '../../src/main/shared/clock.js';
import { AppError } from '../../src/main/shared/errors.js';

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

// Electron в тесте не запускается: проверяем Zod-границу и форму ответа моста.
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMock.handlers.set(channel, handler);
    },
  },
}));

const NOW = '2026-11-06T10:00:00.000Z';
const ACTOR: CatalogActor = { profileId: 'profile-1' };
const BUILT_IN_TYPES = ['квартира', 'дом', 'машиноместо', 'земельный участок', 'нежилое помещение'];
const tempDirs: string[] = [];
let file: string;
let db: AppDatabase;
let deps: CatalogDeps;
let catalog: Catalog;
let sessions: InMemorySessionStore;
let sessionId: string;

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-catalog-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
}

function typeId(name: string): string {
  const type = catalog.listPropertyTypes().find((item) => item.name === name.toLowerCase());
  if (type === undefined) throw new Error(`тип ${name} не найден`);
  return type.id;
}

function captureError(work: () => unknown): AppError {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error('ожидалась ошибка');
}

function reopen(): void {
  db.close();
  db = openAppDatabase(file);
  deps = {
    clock: new FixedClock(NOW),
    recorder: createEventRecorder(db, { deviceId: 'device-1' }),
  };
  catalog = createCatalog(db, deps);
}

beforeEach(() => {
  file = tempDatabaseFile();
  db = openAppDatabase(file);
  deps = {
    clock: new FixedClock(NOW),
    recorder: createEventRecorder(db, { deviceId: 'device-1', clock: new FixedClock(NOW) }),
  };
  catalog = createCatalog(db, deps);
  sessions = new InMemorySessionStore(new FixedClock(NOW));
  sessionId = sessions.create(ACTOR.profileId).id;
  electronMock.handlers.clear();
  registerCatalog(db, deps, sessions);
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('справочник типов объектов', () => {
  it('засеян пятью встроенными типами и позволяет добавить, переименовать и скрыть свой', () => {
    expect(catalog.listPropertyTypes().map((type) => type.name)).toEqual(BUILT_IN_TYPES);

    const custom = catalog.createPropertyType({ name: '  Гараж  ' });
    expect(custom).toMatchObject({ name: 'гараж', isActive: true });

    expect(catalog.updatePropertyType({ id: custom.id, name: 'Гараж во дворе' })).toMatchObject({
      name: 'гараж во дворе',
    });
    catalog.updatePropertyType({ id: custom.id, isActive: false });
    expect(catalog.listPropertyTypes().map((type) => type.name)).not.toContain('гараж во дворе');
    expect(
      catalog.listPropertyTypes({ includeArchived: true }).find((type) => type.id === custom.id),
    ).toMatchObject({ isActive: false });

    // Регистр не важен: «квартира» и «КВАРТИРА» — тот же тип, что встроенная «Квартира».
    for (const name of ['Квартира', 'квартира', 'КВАРТИРА']) {
      expect(captureError(() => catalog.createPropertyType({ name })).code).toBe('CONFLICT');
    }
    expect(captureError(() => catalog.createPropertyType({ name: '   ' })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      captureError(() => catalog.updatePropertyType({ id: typeId('Квартира'), name: 'ДОМ' })).code,
    ).toBe('CONFLICT');
  });
});

describe('объекты: создание, чтение, правка и архив', () => {
  it('создаёт объект со свободным названием, читает его и пишет журнал без адреса', () => {
    const property = catalog.createProperty(ACTOR, {
      typeId: typeId('Квартира'),
      label: '  Карабайка 36 ',
      address: 'Карабайка, 36',
      areaM2: 54.3,
      note: 'Доля в наследство',
    });

    expect(property).toMatchObject({
      label: 'Карабайка 36',
      typeName: 'квартира',
      areaM2: 54.3,
      shareBp: 10000,
      status: 'active',
    });
    expect(catalog.getProperty(property.id)).toEqual(property);

    const change = db.prepare('SELECT * FROM change_log').get() as Record<string, unknown>;
    expect(change).toMatchObject({ entity_type: 'property', operation: 'created' });
    const payload = String(change['payload_json']);
    expect(payload).toContain('Карабайка 36');
    expect(payload).not.toContain('Карабайка, 36');
    expect(payload).not.toContain('наследство');
  });

  it('правит поля и тип, архивирует и возвращает объект, не удаляя историю', () => {
    const property = catalog.createProperty(ACTOR, {
      typeId: typeId('Квартира'),
      label: 'Карабайка 36',
      address: 'Карабайка, 36',
    });

    const updated = catalog.updateProperty(ACTOR, {
      id: property.id,
      typeId: typeId('Дом'),
      label: 'Карабайка 36, дом',
      areaM2: 120,
      shareBp: 5000,
      note: null,
    });
    expect(updated).toMatchObject({
      typeName: 'дом',
      label: 'Карабайка 36, дом',
      areaM2: 120,
      shareBp: 5000,
      note: null,
      createdAt: property.createdAt,
    });

    expect(catalog.archiveProperty(ACTOR, property.id)).toMatchObject({ status: 'archived' });
    expect(catalog.listProperties().map((item) => item.id)).not.toContain(property.id);
    expect(catalog.listProperties({ status: 'archived' }).map((item) => item.id)).toContain(
      property.id,
    );
    expect(catalog.restoreProperty(ACTOR, property.id)).toMatchObject({ status: 'active' });

    const operations = db
      .prepare('SELECT operation FROM change_log ORDER BY logical_clock')
      .pluck()
      .all();
    expect(operations).toEqual(['created', 'updated', 'archived', 'restored']);
    expect(db.prepare('SELECT COUNT(*) FROM property').pluck().get()).toBe(1);
  });

  it('не даёт менять параметры архивного объекта до возврата в активные', () => {
    const property = catalog.createProperty(ACTOR, {
      typeId: typeId('Квартира'),
      label: 'Карабайка 36',
      address: 'Карабайка, 36',
    });
    catalog.archiveProperty(ACTOR, property.id);

    const error = captureError(() =>
      catalog.updateProperty(ACTOR, { id: property.id, label: 'Новое название' }),
    );
    expect(error.code).toBe('BUSINESS_RULE');
    expect(error.details).toMatchObject({ reason: 'PROPERTY_ARCHIVED' });

    catalog.restoreProperty(ACTOR, property.id);
    expect(
      catalog.updateProperty(ACTOR, { id: property.id, label: 'Новое название' }),
    ).toMatchObject({ label: 'Новое название' });
  });

  it('переживает переоткрытие файла данных', () => {
    const property = catalog.createProperty(ACTOR, {
      typeId: typeId('Машиноместо'),
      label: 'Подземный паркинг, 12',
      address: 'Карабайка, 36',
      shareBp: 2500,
    });

    reopen();

    expect(catalog.getProperty(property.id)).toMatchObject({
      label: 'Подземный паркинг, 12',
      typeName: 'машиноместо',
      shareBp: 2500,
    });
    expect(catalog.listProperties()).toHaveLength(1);
  });
});

describe('валидация ввода', () => {
  it('отклоняет пустое название, неверную долю, площадь и скрытый тип', () => {
    const apartment = typeId('Квартира');
    const base = { typeId: apartment, label: 'Объект', address: 'Адрес' };

    expect(captureError(() => catalog.createProperty(ACTOR, { ...base, label: ' ' })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      captureError(() => catalog.createProperty(ACTOR, { ...base, shareBp: 10001 })).code,
    ).toBe('VALIDATION_FAILED');
    expect(captureError(() => catalog.createProperty(ACTOR, { ...base, areaM2: 0 })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      captureError(() => catalog.createProperty(ACTOR, { ...base, typeId: 'unknown' })).code,
    ).toBe('NOT_FOUND');
    expect(captureError(() => catalog.getProperty('unknown')).code).toBe('NOT_FOUND');

    const hidden = catalog.createPropertyType({ name: 'Апартаменты' });
    catalog.updatePropertyType({ id: hidden.id, isActive: false });
    expect(
      captureError(() => catalog.createProperty(ACTOR, { ...base, typeId: hidden.id })).code,
    ).toBe('VALIDATION_FAILED');
    expect(db.prepare('SELECT COUNT(*) FROM property').pluck().get()).toBe(0);
  });
});

describe('IPC-мост каталога', () => {
  type Handler = (event: unknown, input: unknown) => Promise<Record<string, unknown>>;
  const invoke = (
    channel: string,
    input: unknown,
    activeSession = sessionId,
  ): Promise<Record<string, unknown>> =>
    (electronMock.handlers.get(channel) as Handler)({}, { sessionId: activeSession, input });

  it('возвращает VALIDATION_FAILED на неверную форму запроса', async () => {
    const result = await invoke(CATALOG_CREATE_PROPERTY_CHANNEL, {
      typeId: typeId('Квартира'),
      label: 'Объект',
      address: 'Адрес',
      shareBp: 'много',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('создаёт объект по каналу и отдаёт список', async () => {
    const created = await invoke(CATALOG_CREATE_PROPERTY_CHANNEL, {
      typeId: typeId('Дом'),
      label: 'Карабайка 36',
      address: 'Карабайка, 36',
      areaM2: 80,
    });
    expect(created).toMatchObject({ ok: true, data: { label: 'Карабайка 36', typeName: 'дом' } });

    const listed = await invoke(CATALOG_LIST_PROPERTIES_CHANNEL, {});
    expect(listed).toMatchObject({ ok: true, data: [{ label: 'Карабайка 36' }] });

    const types = await invoke(CATALOG_LIST_PROPERTY_TYPES_CHANNEL, {});
    expect(types['ok']).toBe(true);
    expect((types['data'] as Array<{ name: string }>)[0]).toMatchObject({ name: 'квартира' });

    const archived = await invoke(CATALOG_ARCHIVE_PROPERTY_CHANNEL, 'unknown');
    expect(archived).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('сессия и аудит catalog-команд (гейт V2)', () => {
  type Handler = (event: unknown, input: unknown) => Promise<Record<string, unknown>>;
  const invoke = (
    channel: string,
    input: unknown,
    activeSession = sessionId,
  ): Promise<Record<string, unknown>> =>
    (electronMock.handlers.get(channel) as Handler)({}, { sessionId: activeSession, input });

  const propertyInput = () => ({
    typeId: typeId('Квартира'),
    label: 'Карабайка 36',
    address: 'Карабайка, 36',
  });

  it('без активной сессии отвечает UNAUTHENTICATED и ничего не пишет', async () => {
    const unknown = await invoke(CATALOG_CREATE_PROPERTY_CHANNEL, propertyInput(), 'unknown-token');
    expect(unknown).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const types = await invoke(CATALOG_LIST_PROPERTY_TYPES_CHANNEL, {}, 'unknown-token');
    expect(types).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    // Сессия проверяется раньше формы ввода: без входа не раскрываем детали валидации.
    const malformed = await invoke(
      CATALOG_CREATE_PROPERTY_CHANNEL,
      { label: 'x' },
      'unknown-token',
    );
    expect(malformed).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    // Команда без sessionId — невалидный запрос на границе IPC.
    const missing = await (electronMock.handlers.get(CATALOG_CREATE_PROPERTY_CHANNEL) as Handler)(
      {},
      { input: propertyInput() },
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    expect(db.prepare('SELECT COUNT(*) FROM property').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM audit_event').pluck().get()).toBe(0);
  });

  it('пишет audit_event с profileId из сессии на каждое изменение объекта', async () => {
    const created = await invoke(CATALOG_CREATE_PROPERTY_CHANNEL, propertyInput());
    expect(created).toMatchObject({ ok: true });
    const id = (created['data'] as { id: string }).id;

    await invoke(CATALOG_UPDATE_PROPERTY_CHANNEL, { id, label: 'Карабайка 36, кв. 12' });
    await invoke(CATALOG_ARCHIVE_PROPERTY_CHANNEL, id);
    await invoke(CATALOG_RESTORE_PROPERTY_CHANNEL, id);

    const audit = db
      .prepare(
        'SELECT profile_id, action, entity_type, entity_id FROM audit_event ORDER BY occurred_at, id',
      )
      .all();
    expect(audit).toEqual([
      {
        profile_id: ACTOR.profileId,
        action: 'property.create',
        entity_type: 'property',
        entity_id: id,
      },
      {
        profile_id: ACTOR.profileId,
        action: 'property.update',
        entity_type: 'property',
        entity_id: id,
      },
      {
        profile_id: ACTOR.profileId,
        action: 'property.archive',
        entity_type: 'property',
        entity_id: id,
      },
      {
        profile_id: ACTOR.profileId,
        action: 'property.restore',
        entity_type: 'property',
        entity_id: id,
      },
    ]);
  });

  it('аудит пишется в той же транзакции: отказ валидации не оставляет записи', async () => {
    const failed = await invoke(CATALOG_CREATE_PROPERTY_CHANNEL, {
      ...propertyInput(),
      label: '   ',
    });
    expect(failed).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(db.prepare('SELECT COUNT(*) FROM audit_event').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM change_log').pluck().get()).toBe(0);
  });

  it('после перезапуска старый токен недействителен, а объект остаётся в файле', async () => {
    const created = await invoke(CATALOG_CREATE_PROPERTY_CHANNEL, propertyInput());
    const id = (created['data'] as { id: string }).id;

    // Перезапуск приложения: новый процесс, новая память сессий, тот же файл данных.
    db.close();
    db = openAppDatabase(file);
    deps = {
      clock: new FixedClock(NOW),
      recorder: createEventRecorder(db, { deviceId: 'device-1', clock: new FixedClock(NOW) }),
    };
    catalog = createCatalog(db, deps);
    sessions = new InMemorySessionStore(new FixedClock(NOW));
    electronMock.handlers.clear();
    registerCatalog(db, deps, sessions);

    const oldToken = await invoke(CATALOG_LIST_PROPERTIES_CHANNEL, {}, sessionId);
    expect(oldToken).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    // После повторного входа новый токен видит тот же объект.
    const freshSession = sessions.create(ACTOR.profileId).id;
    const listed = await invoke(CATALOG_LIST_PROPERTIES_CHANNEL, {}, freshSession);
    expect(listed).toMatchObject({
      ok: true,
      data: [{ id, label: 'Карабайка 36', status: 'active' }],
    });
  });
});

describe('тип объекта создаётся вместе с объектом (S-05)', () => {
  it('создаёт тип-черновик в транзакции сохранения объекта', () => {
    const property = catalog.createProperty(ACTOR, {
      newTypeName: '  Гараж  ',
      label: 'Гараж 3',
      address: 'Карабайка, 36',
    });

    expect(property.typeName).toBe('гараж');
    const type = catalog.listPropertyTypes().find((item) => item.name === 'гараж');
    expect(type).toMatchObject({ id: property.typeId, usageCount: 1, usedBy: ['Гараж 3'] });
  });

  it('отказ формы и ошибка сохранения не оставляют тип в справочнике', () => {
    const before = catalog.listPropertyTypes().length;
    expect(
      captureError(() =>
        catalog.createProperty(ACTOR, {
          newTypeName: 'Гараж',
          label: '   ',
          address: 'Карабайка, 36',
        }),
      ).code,
    ).toBe('VALIDATION_FAILED');
    expect(catalog.listPropertyTypes()).toHaveLength(before);
    expect(catalog.listPropertyTypes().map((type) => type.name)).not.toContain('гараж');

    // Ошибка внутри транзакции (слишком длинное имя типа) откатывает и тип, и объект.
    expect(
      captureError(() =>
        catalog.createProperty(ACTOR, {
          newTypeName: 'x'.repeat(61),
          label: 'Гараж 3',
          address: 'Карабайка, 36',
        }),
      ).code,
    ).toBe('VALIDATION_FAILED');
    expect(catalog.listPropertyTypes().map((type) => type.name)).not.toContain('x'.repeat(61));
    expect(db.prepare('SELECT COUNT(*) FROM property').pluck().get()).toBe(0);
  });

  it('переиспользует одноимённый тип и возвращает скрытый вместо дубля', () => {
    const existing = catalog.createPropertyType({ name: 'Гараж' });
    const first = catalog.createProperty(ACTOR, {
      newTypeName: 'ГАРАЖ',
      label: 'Гараж 3',
      address: 'Карабайка, 36',
    });
    expect(first.typeId).toBe(existing.id);
    expect(catalog.listPropertyTypes({ includeArchived: true })).toHaveLength(6);

    catalog.updatePropertyType({ id: existing.id, isActive: false });
    const second = catalog.createProperty(ACTOR, {
      newTypeName: 'гараж',
      label: 'Гараж 4',
      address: 'Карабайка, 36',
    });
    expect(second.typeId).toBe(existing.id);
    expect(catalog.listPropertyTypes({ includeArchived: true })).toHaveLength(6);
    expect(catalog.listPropertyTypes().find((type) => type.id === existing.id)).toMatchObject({
      isActive: true,
    });
  });

  it('создаёт тип при редактировании существующего объекта', () => {
    const property = catalog.createProperty(ACTOR, {
      typeId: typeId('Квартира'),
      label: 'Карабайка 36',
      address: 'Карабайка, 36',
    });

    const updated = catalog.updateProperty(ACTOR, {
      id: property.id,
      newTypeName: 'Апартаменты',
    });
    expect(updated).toMatchObject({ typeName: 'апартаменты' });
    expect(catalog.listPropertyTypes().map((type) => type.name)).toContain('апартаменты');
  });
});

describe('удаление незадействованных типов объекта', () => {
  it('удаляет свободный тип встроенный и свой, оставляя журнал и аудит', () => {
    const custom = catalog.createPropertyType({ name: 'Гараж' });

    catalog.deletePropertyType(ACTOR, custom.id);
    expect(
      catalog.listPropertyTypes({ includeArchived: true }).map((type) => type.id),
    ).not.toContain(custom.id);

    const audit = db
      .prepare('SELECT profile_id, action, entity_type, entity_id FROM audit_event')
      .all();
    expect(audit).toEqual([
      {
        profile_id: ACTOR.profileId,
        action: 'property.type.delete',
        entity_type: 'property_type',
        entity_id: custom.id,
      },
    ]);
    expect(
      db
        .prepare("SELECT operation FROM change_log WHERE entity_type = 'property_type'")
        .pluck()
        .all(),
    ).toContain('deleted');

    // Освободившееся имя можно занять снова.
    expect(catalog.createPropertyType({ name: 'гараж' })).toMatchObject({ name: 'гараж' });

    // Встроенный тип без объектов тоже удаляется.
    catalog.deletePropertyType(ACTOR, typeId('Дом'));
    expect(catalog.listPropertyTypes().map((type) => type.name)).not.toContain('дом');
  });

  it('запрещает удаление типа, которым пользуется объект, и объясняет чем', () => {
    const apartment = catalog.createProperty(ACTOR, {
      typeId: typeId('Квартира'),
      label: 'Карабайка 36',
      address: 'Карабайка, 36',
    });

    const error = captureError(() => catalog.deletePropertyType(ACTOR, apartment.typeId));
    expect(error.code).toBe('BUSINESS_RULE');
    expect(error.message).toContain('Карабайка 36');
    expect(error.message).toContain('1');
    expect(error.details).toMatchObject({
      reason: 'TYPE_IN_USE',
      propertyCount: 1,
      properties: [{ id: apartment.id, label: 'Карабайка 36', status: 'active' }],
    });
    expect(catalog.listPropertyTypes().map((type) => type.id)).toContain(apartment.typeId);
    expect(
      db
        .prepare('SELECT COUNT(*) FROM audit_event WHERE action = ?')
        .pluck()
        .get('property.type.delete'),
    ).toBe(0);
  });

  it('считает архивные объекты использованием: удаление закрыто', () => {
    const property = catalog.createProperty(ACTOR, {
      typeId: typeId('Машиноместо'),
      label: 'Паркинг 12',
      address: 'Карабайка, 36',
    });
    catalog.archiveProperty(ACTOR, property.id);

    const error = captureError(() => catalog.deletePropertyType(ACTOR, property.typeId));
    expect(error.code).toBe('BUSINESS_RULE');
    expect(error.message).toContain('(в архиве)');
    expect(error.details).toMatchObject({
      reason: 'TYPE_IN_USE',
      propertyCount: 1,
      properties: [{ label: 'Паркинг 12', status: 'archived' }],
    });
  });

  it('удаляет тип по IPC-каналу и требует активную сессию', async () => {
    type Handler = (event: unknown, input: unknown) => Promise<Record<string, unknown>>;
    const invoke = (channel: string, input: unknown, activeSession = sessionId) =>
      (electronMock.handlers.get(channel) as Handler)({}, { sessionId: activeSession, input });

    const created = await invoke(CATALOG_CREATE_PROPERTY_TYPE_CHANNEL, { name: 'Гараж' });
    const id = (created['data'] as { id: string }).id;

    const denied = await invoke(CATALOG_DELETE_PROPERTY_TYPE_CHANNEL, id, 'unknown-token');
    expect(denied).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const deleted = await invoke(CATALOG_DELETE_PROPERTY_TYPE_CHANNEL, id);
    expect(deleted).toMatchObject({ ok: true, data: null });
    expect(catalog.listPropertyTypes().map((type) => type.id)).not.toContain(id);

    const missing = await invoke(CATALOG_DELETE_PROPERTY_TYPE_CHANNEL, 'unknown');
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
