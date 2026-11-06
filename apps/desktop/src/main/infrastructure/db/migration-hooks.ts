import type { AppDatabase } from './connection.js';

/**
 * Снимок правила нормализации из `catalog/domain/property.ts` на момент
 * миграции. Миграция не импортирует домен: правило заморожено, иначе будущее
 * изменение домена незаметно переписало бы историю файлов.
 */
function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 005: восстановить `name_key` в файлах, созданных до исправления миграции 004
 * (в них UNIQUE-колонки нет, из-за чего создание типа падало `no such column`).
 *
 * SQLite не умеет `ADD COLUMN IF NOT EXISTS`, а кириллицу `lower()` в SQL не
 * приводит без ICU, поэтому шаг данных выполняется здесь — в транзакции
 * миграции, после её SQL. На свежей установке колонка уже есть: шаг ничего не
 * делает.
 */
export function migratePropertyTypeNameKey(db: AppDatabase): void {
  const columns = db.prepare('PRAGMA table_info(property_type)').all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === 'name_key')) return;

  db.exec('ALTER TABLE property_type ADD COLUMN name_key TEXT');
  const rows = db.prepare('SELECT id, name FROM property_type').all() as Array<{
    id: string;
    name: string;
  }>;
  const update = db.prepare('UPDATE property_type SET name_key = ? WHERE id = ?');
  for (const row of rows) update.run(normalizeNameKey(row.name), row.id);
  // NULL в UNIQUE-индексе SQLite считает разными, поэтому индекс безопасен до
  // backfill; после него уникальность снова гарантирует БД.
  db.exec('CREATE UNIQUE INDEX property_type_name_key ON property_type(name_key)');
}

/**
 * 006: привести названия типов в существующем файле к единому виду — нижнему
 * регистру. Хранимое `name` и ключ уникальности `name_key` совпадают.
 */
export function migratePropertyTypeNamesToLowerCase(db: AppDatabase): void {
  const rows = db.prepare('SELECT id, name FROM property_type').all() as Array<{
    id: string;
    name: string;
  }>;
  const update = db.prepare('UPDATE property_type SET name = ?, name_key = ? WHERE id = ?');
  for (const row of rows) {
    const name = normalizeNameKey(row.name);
    update.run(name, name, row.id);
  }
}

/** JS-шаги миграций, которые нельзя выразить идемпотентным SQL. */
export const MIGRATION_HOOKS: Record<number, (db: AppDatabase) => void> = {
  5: migratePropertyTypeNameKey,
  6: migratePropertyTypeNamesToLowerCase,
};
