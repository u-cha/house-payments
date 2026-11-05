import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openConnection, type AppDatabase } from './connection.js';
import { loadMigrations, migrate } from './migrations.js';

/** Рядом с этим модулем: `src/...` в тестах, `dist/node/main/...` в сборке. */
export const DEFAULT_MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

export interface OpenAppDatabaseOptions {
  migrationsDir?: string;
  busyTimeoutMs?: number;
}

/**
 * Открывает файл данных и доводит схему до актуальной. При ошибке миграции
 * соединение закрывается, чтобы не оставить полуоткрытый файл в UI.
 */
export function openAppDatabase(file: string, options: OpenAppDatabaseOptions = {}): AppDatabase {
  const db = openConnection(file, options.busyTimeoutMs);
  try {
    migrate(db, loadMigrations(options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR));
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export { BUSY_TIMEOUT_MS, openConnection, type AppDatabase } from './connection.js';
export { createEventRecorder, type EventRecorderOptions } from './event-recorder.js';
export { loadMigrations, migrate, MigrationError, type Migration } from './migrations.js';
export { withTransaction } from './transaction.js';
