import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_ARCHIVE_PROPERTY_CHANNEL,
  CATALOG_CREATE_PROPERTY_CHANNEL,
  CATALOG_LIST_PROPERTIES_CHANNEL,
  CATALOG_LIST_PROPERTY_TYPES_CHANNEL,
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
  type CatalogDeps,
} from '../../src/main/modules/catalog/api.js';
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
const BUILT_IN_TYPES = ['Квартира', 'Дом', 'Машиноместо', 'Земельный участок', 'Нежилое помещение'];
const tempDirs: string[] = [];
let file: string;
let db: AppDatabase;
let deps: CatalogDeps;
let catalog: Catalog;

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-catalog-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
}

function typeId(name: string): string {
  const type = catalog.listPropertyTypes().find((item) => item.name === name);
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
  electronMock.handlers.clear();
  registerCatalog(db, deps);
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('справочник типов объектов', () => {
  it('засеян пятью встроенными типами и позволяет добавить, переименовать и скрыть свой', () => {
    expect(catalog.listPropertyTypes().map((type) => type.name)).toEqual(BUILT_IN_TYPES);

    const custom = catalog.createPropertyType({ name: '  Гараж  ' });
    expect(custom).toMatchObject({ name: 'Гараж', isActive: true });

    expect(catalog.updatePropertyType({ id: custom.id, name: 'Гараж во дворе' })).toMatchObject({
      name: 'Гараж во дворе',
    });
    catalog.updatePropertyType({ id: custom.id, isActive: false });
    expect(catalog.listPropertyTypes().map((type) => type.name)).not.toContain('Гараж во дворе');
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
    const property = catalog.createProperty({
      typeId: typeId('Квартира'),
      label: '  Карабайка 36 ',
      address: 'Карабайка, 36',
      areaM2: 54.3,
      note: 'Доля в наследство',
    });

    expect(property).toMatchObject({
      label: 'Карабайка 36',
      typeName: 'Квартира',
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
    const property = catalog.createProperty({
      typeId: typeId('Квартира'),
      label: 'Карабайка 36',
      address: 'Карабайка, 36',
    });

    const updated = catalog.updateProperty({
      id: property.id,
      typeId: typeId('Дом'),
      label: 'Карабайка 36, дом',
      areaM2: 120,
      shareBp: 5000,
      note: null,
    });
    expect(updated).toMatchObject({
      typeName: 'Дом',
      label: 'Карабайка 36, дом',
      areaM2: 120,
      shareBp: 5000,
      note: null,
      createdAt: property.createdAt,
    });

    expect(catalog.archiveProperty(property.id)).toMatchObject({ status: 'archived' });
    expect(catalog.listProperties().map((item) => item.id)).not.toContain(property.id);
    expect(catalog.listProperties({ status: 'archived' }).map((item) => item.id)).toContain(
      property.id,
    );
    expect(catalog.restoreProperty(property.id)).toMatchObject({ status: 'active' });

    const operations = db
      .prepare('SELECT operation FROM change_log ORDER BY logical_clock')
      .pluck()
      .all();
    expect(operations).toEqual(['created', 'updated', 'archived', 'restored']);
    expect(db.prepare('SELECT COUNT(*) FROM property').pluck().get()).toBe(1);
  });

  it('переживает переоткрытие файла данных', () => {
    const property = catalog.createProperty({
      typeId: typeId('Машиноместо'),
      label: 'Подземный паркинг, 12',
      address: 'Карабайка, 36',
      shareBp: 2500,
    });

    reopen();

    expect(catalog.getProperty(property.id)).toMatchObject({
      label: 'Подземный паркинг, 12',
      typeName: 'Машиноместо',
      shareBp: 2500,
    });
    expect(catalog.listProperties()).toHaveLength(1);
  });
});

describe('валидация ввода', () => {
  it('отклоняет пустое название, неверную долю, площадь и скрытый тип', () => {
    const apartment = typeId('Квартира');
    const base = { typeId: apartment, label: 'Объект', address: 'Адрес' };

    expect(captureError(() => catalog.createProperty({ ...base, label: ' ' })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(captureError(() => catalog.createProperty({ ...base, shareBp: 10001 })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(captureError(() => catalog.createProperty({ ...base, areaM2: 0 })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(captureError(() => catalog.createProperty({ ...base, typeId: 'unknown' })).code).toBe(
      'NOT_FOUND',
    );
    expect(captureError(() => catalog.getProperty('unknown')).code).toBe('NOT_FOUND');

    const hidden = catalog.createPropertyType({ name: 'Апартаменты' });
    catalog.updatePropertyType({ id: hidden.id, isActive: false });
    expect(captureError(() => catalog.createProperty({ ...base, typeId: hidden.id })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(db.prepare('SELECT COUNT(*) FROM property').pluck().get()).toBe(0);
  });
});

describe('IPC-мост каталога', () => {
  type Handler = (event: unknown, input: unknown) => Promise<Record<string, unknown>>;
  const invoke = (channel: string, input: unknown): Promise<Record<string, unknown>> =>
    (electronMock.handlers.get(channel) as Handler)({}, input);

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
    expect(created).toMatchObject({ ok: true, data: { label: 'Карабайка 36', typeName: 'Дом' } });

    const listed = await invoke(CATALOG_LIST_PROPERTIES_CHANNEL, {});
    expect(listed).toMatchObject({ ok: true, data: [{ label: 'Карабайка 36' }] });

    const types = await invoke(CATALOG_LIST_PROPERTY_TYPES_CHANNEL, {});
    expect(types['ok']).toBe(true);
    expect((types['data'] as Array<{ name: string }>)[0]).toMatchObject({ name: 'Квартира' });

    const archived = await invoke(CATALOG_ARCHIVE_PROPERTY_CHANNEL, 'unknown');
    expect(archived).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
