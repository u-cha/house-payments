import Database from 'better-sqlite3';

/**
 * Сколько ждать снятия блокировки записи, прежде чем вернуть SQLITE_BUSY.
 * Один процесс-писатель, но WAL-чекпойнт и будущий импорт могут пересечься.
 */
export const BUSY_TIMEOUT_MS = 5_000;

export type AppDatabase = Database.Database;

/**
 * Открывает SQLite-файл с настройками из ADR-0005/ADR-0008: WAL — много
 * читателей и один писатель; foreign_keys — ссылочная целостность; busy_timeout
 * и synchronous=NORMAL — предсказуемая запись без лишних fsync.
 */
export function openConnection(file: string, busyTimeoutMs: number = BUSY_TIMEOUT_MS): AppDatabase {
  const db = new Database(file);
  // Если файл — не база SQLite, первый pragma бросает SQLITE_NOTADB. Без close()
  // дескриптор остаётся открытым: на Linux/macOS это незаметно, а на Windows файл
  // остаётся заблокированным и его нельзя удалить (ловит матрица CI, ADR-0022).
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma(`busy_timeout = ${Math.trunc(busyTimeoutMs)}`);
    db.pragma('synchronous = NORMAL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
