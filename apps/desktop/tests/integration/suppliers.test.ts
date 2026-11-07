import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_ARCHIVE_SUPPLIER_CHANNEL,
  CATALOG_CREATE_SUPPLIER_CHANNEL,
  CATALOG_FIND_SUPPLIERS_BY_NAME_CHANNEL,
  CATALOG_GET_SUPPLIER_CHANNEL,
  CATALOG_LIST_SUPPLIERS_CHANNEL,
  CATALOG_RESTORE_SUPPLIER_CHANNEL,
  CATALOG_UPDATE_SUPPLIER_CHANNEL,
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

const NOW = '2026-11-07T10:00:00.000Z';
const ACTOR: CatalogActor = { profileId: 'profile-1' };
const tempDirs: string[] = [];
let file: string;
let db: AppDatabase;
let deps: CatalogDeps;
let catalog: Catalog;
let sessions: InMemorySessionStore;
let sessionId: string;

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-suppliers-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
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

function invoke(channel: string, payload: unknown): Promise<unknown> {
  const handler = electronMock.handlers.get(channel);
  if (handler === undefined) throw new Error(`нет обработчика канала ${channel}`);
  return Promise.resolve(handler({}, payload));
}

async function invokeError(channel: string, payload: unknown): Promise<string> {
  const result = (await invoke(channel, payload)) as { ok: boolean; error?: { code: string } };
  expect(result.ok).toBe(false);
  return result.error?.code ?? 'нет кода';
}

function auditActions(): string[] {
  return db
    .prepare(
      "SELECT action FROM audit_event WHERE entity_type = 'supplier' ORDER BY occurred_at, rowid",
    )
    .pluck()
    .all() as string[];
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

describe('миграция supplier', () => {
  it('создаёт таблицу с CHECK kind и обычным индексом name_key', () => {
    const columns = db.prepare('PRAGMA table_info(supplier)').all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'name',
      'name_key',
      'kind',
      'contacts',
      'note',
      'is_active',
      'created_at',
      'updated_at',
    ]);
    expect(columns.find((column) => column.name === 'name_key')?.notnull).toBe(1);

    const indexes = db.prepare('PRAGMA index_list(supplier)').all() as Array<{
      name: string;
      unique: number;
    }>;
    const nameKeyIndex = indexes.find((index) => index.name === 'supplier_name_key');
    expect(nameKeyIndex).toBeDefined();
    // Уникальности нет: дубли разрешены (R-13).
    expect(nameKeyIndex?.unique).toBe(0);

    expect(() =>
      db
        .prepare(
          `INSERT INTO supplier (id, name, name_key, kind, is_active, created_at, updated_at)
           VALUES ('s-bad', 'Плохой', 'плохой', 'no-such-kind', 1, ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK constraint failed/);
  });

  it('разрешает два supplier с одинаковым name_key на уровне схемы', () => {
    const insert = db.prepare(
      `INSERT INTO supplier (id, name, name_key, kind, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'other', 1, ?, ?)`,
    );
    insert.run('s-1', 'Дом', 'дом', NOW, NOW);
    expect(() => insert.run('s-2', 'ДОМ', 'дом', NOW, NOW)).not.toThrow();
  });
});

describe('поставщики: создание, чтение и список', () => {
  it('создаёт поставщика, нормализует поля и читает обратно', () => {
    const supplier = catalog.createSupplier(ACTOR, {
      name: '  УК «Карабайка»  ',
      kind: 'uk',
      contacts: '  тел. 8 900 000-00-00  ',
      note: '  домофон в подъезде  ',
    });
    expect(supplier).toMatchObject({
      name: 'УК «Карабайка»',
      nameKey: 'ук «карабайка»',
      kind: 'uk',
      contacts: 'тел. 8 900 000-00-00',
      note: 'домофон в подъезде',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(catalog.getSupplier(supplier.id)).toEqual(supplier);
    expect(catalog.listSuppliers()).toEqual([supplier]);
  });

  it('считает пустые контакты и заметку отсутствием значения', () => {
    const supplier = catalog.createSupplier(ACTOR, {
      name: 'ТСЖ',
      kind: 'tsj',
      contacts: '   ',
      note: '',
    });
    expect(supplier.contacts).toBeNull();
    expect(supplier.note).toBeNull();
  });

  it('переживает переоткрытие файла данных', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'РСО Энерго', kind: 'rso' });
    db.close();
    db = openAppDatabase(file);
    catalog = createCatalog(db, {
      clock: new FixedClock(NOW),
      recorder: createEventRecorder(db, { deviceId: 'device-1' }),
    });
    expect(catalog.getSupplier(supplier.id)).toEqual(supplier);
  });

  it('отдаёт NOT_FOUND для неизвестного поставщика', () => {
    expect(captureError(() => catalog.getSupplier('no-such-supplier')).code).toBe('NOT_FOUND');
  });
});

describe('поставщики: поиск и фильтры', () => {
  beforeEach(() => {
    catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    catalog.createSupplier(ACTOR, { name: 'УК Центральная', kind: 'uk' });
    catalog.createSupplier(ACTOR, { name: 'ТСЖ Ромашка', kind: 'tsj' });
    const archived = catalog.createSupplier(ACTOR, { name: 'РСО Тепло', kind: 'rso' });
    catalog.archiveSupplier(ACTOR, archived.id);
  });

  it('ищет по части названия без учёта регистра и пробелов', () => {
    expect(catalog.listSuppliers({ query: '  КАРАБАЙКА ' }).map((item) => item.name)).toEqual([
      'УК Карабайка',
    ]);
    expect(catalog.listSuppliers({ query: 'ук' }).map((item) => item.name)).toEqual([
      'УК Карабайка',
      'УК Центральная',
    ]);
    expect(catalog.listSuppliers({ query: 'нет такого' })).toEqual([]);
  });

  it('фильтрует по типу и не смешивает активных с архивом', () => {
    expect(catalog.listSuppliers({ kind: 'uk' }).map((item) => item.name)).toEqual([
      'УК Карабайка',
      'УК Центральная',
    ]);
    expect(catalog.listSuppliers().map((item) => item.name)).not.toContain('РСО Тепло');
    expect(catalog.listSuppliers({ includeArchived: true }).map((item) => item.name)).toEqual([
      'РСО Тепло',
      'ТСЖ Ромашка',
      'УК Карабайка',
      'УК Центральная',
    ]);
    expect(catalog.listSuppliers({ kind: 'rso' })).toEqual([]);
    expect(
      catalog.listSuppliers({ kind: 'rso', includeArchived: true }).map((item) => item.name),
    ).toEqual(['РСО Тепло']);
  });

  it('не даёт подставить неверный тип или флаги в фильтр', () => {
    expect(captureError(() => catalog.listSuppliers({ kind: 'bad' as never })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      captureError(() => catalog.listSuppliers({ includeArchived: 'yes' as never })).code,
    ).toBe('VALIDATION_FAILED');
    expect(captureError(() => catalog.listSuppliers({ query: 1 as never })).code).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('поставщики: валидация', () => {
  it('отклоняет пустое и слишком длинное название', () => {
    expect(
      captureError(() => catalog.createSupplier(ACTOR, { name: '   ', kind: 'uk' })).code,
    ).toBe('VALIDATION_FAILED');
    expect(
      captureError(() => catalog.createSupplier(ACTOR, { name: 'x'.repeat(201), kind: 'uk' })).code,
    ).toBe('VALIDATION_FAILED');
    expect(catalog.createSupplier(ACTOR, { name: 'x'.repeat(200), kind: 'uk' }).name).toHaveLength(
      200,
    );
  });

  it('отклоняет неизвестный тип, длинные контакты и заметку', () => {
    const base = { name: 'Поставщик', kind: 'uk' as const };
    expect(
      captureError(() => catalog.createSupplier(ACTOR, { ...base, kind: 'bad' as never })).code,
    ).toBe('VALIDATION_FAILED');
    expect(
      captureError(() => catalog.createSupplier(ACTOR, { ...base, contacts: 'x'.repeat(501) }))
        .code,
    ).toBe('VALIDATION_FAILED');
    expect(
      captureError(() => catalog.createSupplier(ACTOR, { ...base, note: 'x'.repeat(2_001) })).code,
    ).toBe('VALIDATION_FAILED');
  });
});

describe('поставщики: дубли названий (R-13)', () => {
  it('разрешает дубль и предупреждает о нём через findSuppliersByName', () => {
    const first = catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    const second = catalog.createSupplier(ACTOR, { name: '  ук карабайка ', kind: 'tsj' });
    expect(second.id).not.toBe(first.id);
    expect(second.nameKey).toBe(first.nameKey);

    const found = catalog.findSuppliersByName(' УК КАРАБАЙКА ');
    expect(found.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(found.map((item) => item.kind)).toEqual(['uk', 'tsj']);
  });

  it('показывает в предупреждении и архивного поставщика с пометкой активности', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'РСО Тепло', kind: 'rso' });
    catalog.archiveSupplier(ACTOR, supplier.id);
    expect(catalog.findSuppliersByName('рсо тепло')).toEqual([
      expect.objectContaining({ id: supplier.id, isActive: false }),
    ]);
  });

  it('на пустой запрос и на имя без совпадений отвечает пустым списком', () => {
    catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    expect(catalog.findSuppliersByName('   ')).toEqual([]);
    expect(catalog.findSuppliersByName('Мосэнерго')).toEqual([]);
  });
});

describe('поставщики: правка, архив и восстановление', () => {
  it('правит поля и пересчитывает name_key при переименовании', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'Старое имя', kind: 'other' });
    const updated = catalog.updateSupplier(ACTOR, {
      id: supplier.id,
      name: '  Новое имя ',
      kind: 'uk',
      contacts: 'почта',
    });
    expect(updated).toMatchObject({
      name: 'Новое имя',
      nameKey: 'новое имя',
      kind: 'uk',
      contacts: 'почта',
      note: null,
    });
    expect(catalog.findSuppliersByName('старое имя')).toEqual([]);
    expect(catalog.findSuppliersByName('новое имя').map((item) => item.id)).toEqual([supplier.id]);
  });

  it('не меняет поставщика, если поля не изменились', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    expect(catalog.updateSupplier(ACTOR, { id: supplier.id, name: 'УК Карабайка' })).toEqual(
      supplier,
    );
  });

  it('архивирует и возвращает поставщика, сохраняя историю', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    const archived = catalog.archiveSupplier(ACTOR, supplier.id);
    expect(archived.isActive).toBe(false);
    expect(catalog.listSuppliers()).toEqual([]);
    expect(catalog.getSupplier(supplier.id).isActive).toBe(false);

    const restored = catalog.restoreSupplier(ACTOR, supplier.id);
    expect(restored.isActive).toBe(true);
    expect(catalog.listSuppliers()).toEqual([restored]);
  });

  it('не даёт менять архивного поставщика до возврата в активные', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    catalog.archiveSupplier(ACTOR, supplier.id);
    const error = captureError(() =>
      catalog.updateSupplier(ACTOR, { id: supplier.id, name: 'Другое' }),
    );
    expect(error.code).toBe('BUSINESS_RULE');
    expect(error.details).toMatchObject({ reason: 'SUPPLIER_ARCHIVED' });
  });
});

describe('аудит поставщиков', () => {
  it('пишет audit_event и change_log на каждое изменение в одной транзакции', () => {
    const supplier = catalog.createSupplier(ACTOR, {
      name: 'УК Карабайка',
      kind: 'uk',
      contacts: 'секретный телефон',
    });
    catalog.updateSupplier(ACTOR, { id: supplier.id, name: 'УК Карабайка 2' });
    catalog.archiveSupplier(ACTOR, supplier.id);
    catalog.restoreSupplier(ACTOR, supplier.id);

    expect(auditActions()).toEqual([
      'supplier.create',
      'supplier.update',
      'supplier.archive',
      'supplier.restore',
    ]);
    expect(
      db
        .prepare("SELECT DISTINCT profile_id FROM audit_event WHERE entity_type = 'supplier'")
        .pluck()
        .all(),
    ).toEqual([ACTOR.profileId]);

    const changes = db
      .prepare(
        "SELECT operation, payload_json FROM change_log WHERE entity_type = 'supplier' ORDER BY logical_clock",
      )
      .all() as Array<{ operation: string; payload_json: string }>;
    expect(changes.map((change) => change.operation)).toEqual([
      'created',
      'updated',
      'archived',
      'restored',
    ]);
    // Контакты — персональные данные: в журнал изменений они не попадают.
    expect(changes[0]?.payload_json).not.toContain('секретный телефон');
  });

  it('отказ валидации не оставляет ни поставщика, ни аудита', () => {
    expect(captureError(() => catalog.createSupplier(ACTOR, { name: ' ', kind: 'uk' })).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(catalog.listSuppliers({ includeArchived: true })).toEqual([]);
    expect(auditActions()).toEqual([]);
  });

  it('повторный архив не пишет второй записи аудита', () => {
    const supplier = catalog.createSupplier(ACTOR, { name: 'УК Карабайка', kind: 'uk' });
    catalog.archiveSupplier(ACTOR, supplier.id);
    catalog.archiveSupplier(ACTOR, supplier.id);
    expect(auditActions()).toEqual(['supplier.create', 'supplier.archive']);
  });
});

describe('IPC-мост поставщиков', () => {
  it('создаёт поставщика по каналу, отдаёт список и предупреждение о дубле', async () => {
    const created = (await invoke(CATALOG_CREATE_SUPPLIER_CHANNEL, {
      sessionId,
      input: { name: 'УК Карабайка', kind: 'uk', contacts: 'тел' },
    })) as { ok: true; data: { id: string; name: string; nameKey: string } };
    expect(created.ok).toBe(true);
    expect(created.data).toMatchObject({ name: 'УК Карабайка', nameKey: 'ук карабайка' });

    const listed = (await invoke(CATALOG_LIST_SUPPLIERS_CHANNEL, {
      sessionId,
      input: {},
    })) as { ok: true; data: unknown[] };
    expect(listed.data).toHaveLength(1);

    const duplicates = (await invoke(CATALOG_FIND_SUPPLIERS_BY_NAME_CHANNEL, {
      sessionId,
      input: 'УК КАРАБАЙКА',
    })) as { ok: true; data: Array<{ id: string }> };
    expect(duplicates.data.map((item) => item.id)).toEqual([created.data.id]);

    const updated = (await invoke(CATALOG_UPDATE_SUPPLIER_CHANNEL, {
      sessionId,
      input: { id: created.data.id, kind: 'other' },
    })) as { ok: true; data: { kind: string } };
    expect(updated.data.kind).toBe('other');

    await invoke(CATALOG_ARCHIVE_SUPPLIER_CHANNEL, { sessionId, input: created.data.id });
    const archived = (await invoke(CATALOG_GET_SUPPLIER_CHANNEL, {
      sessionId,
      input: created.data.id,
    })) as { ok: true; data: { isActive: boolean } };
    expect(archived.data.isActive).toBe(false);

    await invoke(CATALOG_RESTORE_SUPPLIER_CHANNEL, { sessionId, input: created.data.id });
    const restored = (await invoke(CATALOG_GET_SUPPLIER_CHANNEL, {
      sessionId,
      input: created.data.id,
    })) as { ok: true; data: { isActive: boolean } };
    expect(restored.data.isActive).toBe(true);
  });

  it('требует активную сессию и ничего не пишет без неё', async () => {
    const result = await invokeError(CATALOG_CREATE_SUPPLIER_CHANNEL, {
      sessionId: 'unknown-session',
      input: { name: 'УК Карабайка', kind: 'uk' },
    });
    expect(result).toBe('UNAUTHENTICATED');
    expect(catalog.listSuppliers({ includeArchived: true })).toEqual([]);
  });

  it('отвечает VALIDATION_FAILED на неверную форму и неизвестный канал не падает', async () => {
    expect(
      await invokeError(CATALOG_CREATE_SUPPLIER_CHANNEL, {
        sessionId,
        input: { name: 'УК', kind: 'bad' },
      }),
    ).toBe('VALIDATION_FAILED');
    expect(
      await invokeError(CATALOG_LIST_SUPPLIERS_CHANNEL, {
        sessionId,
        input: { includeArchived: 'yes' },
      }),
    ).toBe('VALIDATION_FAILED');
    expect(
      await invokeError(CATALOG_UPDATE_SUPPLIER_CHANNEL, { sessionId, input: { name: 'без id' } }),
    ).toBe('VALIDATION_FAILED');
  });
});
