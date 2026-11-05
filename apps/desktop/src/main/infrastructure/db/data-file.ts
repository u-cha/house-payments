import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../../shared/errors.js';
import { type AppDatabase, openConnection } from './connection.js';
import { DEFAULT_MIGRATIONS_DIR, loadMigrations, migrate } from './migrations.js';

/** Имя рабочего файла зафиксировано ADR-0008: один переносимый файл данных. */
export const DATA_FILE_NAME = 'house-payments.hpd';

const UNSUPPORTED_MESSAGE =
  'Файл данных создан более новой версией приложения. Обновите приложение, чтобы открыть его.';
const CORRUPTED_MESSAGE = 'Файл данных повреждён. Восстановите его из резервной копии.';

export interface OpenDataFileOptions {
  migrationsDir?: string;
  busyTimeoutMs?: number;
}

/** Путь к единственному файлу данных в каталоге `app.getPath('userData')`. */
export function dataFilePath(userDataDir: string): string {
  return path.join(userDataDir, DATA_FILE_NAME);
}

function corruptedFileError(): AppError {
  return new AppError({
    code: 'STORAGE_FAILURE',
    message: CORRUPTED_MESSAGE,
    details: { reason: 'FILE_CORRUPTED' },
    retryable: false,
  });
}

/** SQLite сообщает о повреждении кодом `SQLITE_NOTADB`/`SQLITE_CORRUPT*`. */
function isCorruption(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  return code === 'SQLITE_NOTADB' || code.startsWith('SQLITE_CORRUPT');
}

/** `PRAGMA quick_check` при открытии: испорченный файл не перезаписывается. */
function assertIntegrity(db: AppDatabase): void {
  if (db.pragma('quick_check', { simple: true }) !== 'ok') throw corruptedFileError();
}

/** Версия схемы файла; 0 — файла ещё нет или таблицы `schema_version` нет. */
function fileSchemaVersion(db: AppDatabase): number {
  const hasTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .pluck()
    .get();
  if (hasTable === undefined) return 0;
  return Number(db.prepare('SELECT COALESCE(MAX(version), 0) FROM schema_version').pluck().get());
}

/**
 * Открывает (или создаёт) файл данных в userData, проверяет целостность и
 * версию схемы, затем применяет недостающие миграции. Файл новее приложения
 * (INV-20) отклоняется `SCHEMA_VERSION_UNSUPPORTED` до любых записей.
 */
export function openDataFile(userDataDir: string, options: OpenDataFileOptions = {}): AppDatabase {
  fs.mkdirSync(userDataDir, { recursive: true });
  const migrations = loadMigrations(options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR);
  const supportedVersion = migrations.at(-1)?.version ?? 0;

  let db: AppDatabase;
  try {
    db = openConnection(dataFilePath(userDataDir), options.busyTimeoutMs);
  } catch (error) {
    if (isCorruption(error)) throw corruptedFileError();
    throw error;
  }

  try {
    assertIntegrity(db);
    const fileVersion = fileSchemaVersion(db);
    if (fileVersion > supportedVersion) {
      throw new AppError({
        code: 'BUSINESS_RULE',
        message: UNSUPPORTED_MESSAGE,
        // Повтор не поможет: нужна новая версия приложения, а не другой вызов.
        details: { reason: 'SCHEMA_VERSION_UNSUPPORTED', fileVersion, supportedVersion },
        retryable: false,
      });
    }
    migrate(db, migrations);
    return db;
  } catch (error) {
    db.close();
    if (isCorruption(error)) throw corruptedFileError();
    throw error;
  }
}
