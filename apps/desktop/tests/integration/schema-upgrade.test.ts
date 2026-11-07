import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEventRecorder,
  openAppDatabase,
  type AppDatabase,
} from '../../src/main/infrastructure/db/index.js';
import { createCatalog } from '../../src/main/modules/catalog/api.js';
import { FixedClock } from '../../src/main/shared/clock.js';
import { AppError } from '../../src/main/shared/errors.js';

const tempDirs: string[] = [];
const NOW = '2026-11-06T10:00:00.000Z';

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-upgrade-'));
  tempDirs.push(dir);
  return path.join(dir, 'house-payments.hpd');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function captureError(work: () => unknown): AppError {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error('ожидалась ошибка');
}

/**
 * Регрессия из ручной проверки: файл, созданный до исправления миграции 004,
 * не имеет `property_type.name_key`, и добавление типа падало внутренней
 * ошибкой SQLite. Миграция 005 должна починить такой файл без потери типов.
 */
describe('миграции 005–006: name_key и нижний регистр в существующем файле', () => {
  it('добавляет колонку, заполняет ключи и возвращает добавление типов', () => {
    const file = tempDatabaseFile();

    // Полная схема 001–005, затем откатываем property_type к старому виду.
    const db = openAppDatabase(file);
    db.exec(`
      DROP TABLE property_type;
      CREATE TABLE property_type (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 100,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO property_type (id, name, sort_order, is_active, created_at) VALUES
        ('0192c000-0000-7000-8000-000000000001', 'Квартира', 10, 1, '${NOW}'),
        ('0192c000-0000-7000-8000-000000000002', 'Дом', 20, 1, '${NOW}'),
        ('0192c000-0000-7000-8000-000000000003', 'Машиноместо', 30, 1, '${NOW}'),
        ('0192c000-0000-7000-8000-000000000004', 'Земельный участок', 40, 1, '${NOW}'),
        ('0192c000-0000-7000-8000-000000000005', 'Нежилое помещение', 50, 1, '${NOW}'),
        ('0192c000-0000-7000-8000-000000000006', 'Гараж', 100, 1, '${NOW}');
      DELETE FROM schema_version WHERE version IN (5, 6);
    `);
    db.close();

    // Перезапуск приложения на «старом» файле доводит схему до 005.
    const upgraded: AppDatabase = openAppDatabase(file);
    try {
      const versions = upgraded
        .prepare('SELECT version FROM schema_version ORDER BY version')
        .pluck()
        .all();
      expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7]);

      const keys = upgraded
        .prepare('SELECT name, name_key FROM property_type ORDER BY name')
        .all() as Array<{ name: string; name_key: string }>;
      // Миграция 006 приводит хранимое название и ключ к нижнему регистру.
      expect(keys).toEqual(
        expect.arrayContaining([
          { name: 'гараж', name_key: 'гараж' },
          { name: 'квартира', name_key: 'квартира' },
          { name: 'машиноместо', name_key: 'машиноместо' },
        ]),
      );

      const catalog = createCatalog(upgraded, {
        clock: new FixedClock(NOW),
        recorder: createEventRecorder(upgraded, {
          deviceId: 'device-1',
          clock: new FixedClock(NOW),
        }),
      });

      expect(catalog.createPropertyType({ name: 'Погреб' })).toMatchObject({ name: 'погреб' });
      // Уникальность без учёта регистра снова обеспечивается БД.
      expect(captureError(() => catalog.createPropertyType({ name: 'ПОГРЕБ' })).code).toBe(
        'CONFLICT',
      );
      expect(
        upgraded.prepare("SELECT name_key FROM property_type WHERE name = 'погреб'").pluck().get(),
      ).toBe('погреб');
    } finally {
      upgraded.close();
    }
  });

  it('на свежей установке ничего не меняет: колонка и данные уже на месте', () => {
    const file = tempDatabaseFile();
    const db = openAppDatabase(file);
    try {
      const rows = db
        .prepare('SELECT name, name_key FROM property_type ORDER BY sort_order')
        .all() as Array<{ name: string; name_key: string }>;
      expect(rows.map((row) => row.name)).toEqual([
        'квартира',
        'дом',
        'машиноместо',
        'земельный участок',
        'нежилое помещение',
      ]);
      expect(rows.map((row) => row.name_key)).toEqual([
        'квартира',
        'дом',
        'машиноместо',
        'земельный участок',
        'нежилое помещение',
      ]);
    } finally {
      db.close();
    }
  });
});
