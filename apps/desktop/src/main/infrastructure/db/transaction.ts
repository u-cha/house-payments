import type { AppDatabase } from './connection.js';

/**
 * Граница записи use case (core-modules §7, ADR-0005): BEGIN IMMEDIATE, а при
 * любой ошибке — ROLLBACK, чтобы состояние, аудит и журнал не разошлись.
 * Вложенный вызов присоединяется к уже открытой транзакции: use case может
 * собирать операции из нескольких портов атомарно.
 */
export function withTransaction<T>(db: AppDatabase, work: () => T): T {
  if (db.inTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
