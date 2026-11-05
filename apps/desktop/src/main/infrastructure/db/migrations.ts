import fs from 'node:fs';
import path from 'node:path';
import type { AppDatabase } from './connection.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** `001_initial.sql` → версия 001, имя `initial`. */
const FILE_PATTERN = /^(\d+)[_-]([a-z0-9_-]+)\.sql$/i;

/** `schema_version` заводится раннером, а не миграцией (entities.md §8). */
const SCHEMA_VERSION_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  note TEXT
) STRICT;
`;

export class MigrationError extends Error {
  override name = 'MigrationError';
}

/** Читает SQL-файлы и проверяет, что нумерация сплошная: пропуск — потерянная миграция. */
export function loadMigrations(dir: string): Migration[] {
  if (!fs.existsSync(dir)) {
    throw new MigrationError(`Migrations directory not found: ${dir}`);
  }
  const migrations: Migration[] = [];
  for (const file of fs.readdirSync(dir)) {
    const match = FILE_PATTERN.exec(file);
    if (!match) continue;
    const version = Number(match[1]);
    migrations.push({
      version,
      name: match[2] ?? file,
      sql: fs.readFileSync(path.join(dir, file), 'utf8'),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(
        `Migrations must be numbered 1..N without gaps, got ${migration.version} at position ${index + 1}`,
      );
    }
  });
  return migrations;
}

/**
 * Применяет только недостающие миграции, каждую — в своей транзакции вместе с
 * записью в `schema_version`. Откат не поддерживается: только вперёд (ADR-0008).
 */
export function migrate(db: AppDatabase, migrations: Migration[]): number[] {
  db.exec(SCHEMA_VERSION_DDL);
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_version')
      .pluck()
      .all()
      .map((value) => Number(value)),
  );

  const latestKnown = migrations.at(-1)?.version ?? 0;
  const latestApplied = Math.max(0, ...applied);
  if (latestApplied > latestKnown) {
    // INV-20: файл новее приложения. Старая версия не должна его «чинить».
    throw new MigrationError(
      `Database schema_version=${latestApplied} is newer than supported ${latestKnown}`,
    );
  }

  const insertVersion = db.prepare(
    'INSERT INTO schema_version (version, applied_at, note) VALUES (?, ?, ?)',
  );
  const ran: number[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      insertVersion.run(migration.version, new Date().toISOString(), migration.name);
    }).immediate();
    ran.push(migration.version);
  }
  return ran;
}
