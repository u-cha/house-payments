import { openConnection, type AppDatabase } from './connection.js';
import { DEFAULT_MIGRATIONS_DIR, loadMigrations, migrate } from './migrations.js';

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
export {
  DATA_FILE_NAME,
  dataFilePath,
  openDataFile,
  type OpenDataFileOptions,
} from './data-file.js';
export { createEventRecorder, type EventRecorderOptions } from './event-recorder.js';
export {
  DEFAULT_MIGRATIONS_DIR,
  loadMigrations,
  migrate,
  MigrationError,
  type Migration,
} from './migrations.js';
export { withTransaction } from './transaction.js';
