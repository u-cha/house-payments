import { systemClock, type Clock } from '../../shared/clock.js';
import type { AuditEventInput, DomainEventInput, EventRecorder } from '../../shared/events.js';
import { uuidv7 } from '../../shared/ids.js';
import type { AppDatabase } from './connection.js';

export interface EventRecorderOptions {
  deviceId: string;
  clock?: Clock;
}

/**
 * SQLite-адаптер порта событий. `logical_clock` считается из журнала в границах
 * сущности и строго возрастает (INV-18); вызывать только внутри транзакции.
 */
export function createEventRecorder(
  db: AppDatabase,
  { deviceId, clock = systemClock }: EventRecorderOptions,
): EventRecorder {
  const nextClock = db
    .prepare(
      `SELECT COALESCE(MAX(logical_clock), 0) + 1 FROM change_log
       WHERE entity_type = ? AND entity_id = ?`,
    )
    .pluck();
  const insertChange = db.prepare(
    `INSERT INTO change_log
       (id, entity_type, entity_id, operation, payload_json, device_id, logical_clock, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAudit = db.prepare(
    `INSERT INTO audit_event
       (id, profile_id, occurred_at, action, entity_type, entity_id, reason, correlation_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    recordChange(event: DomainEventInput): void {
      insertChange.run(
        uuidv7(),
        event.entityType,
        event.entityId,
        event.operation,
        JSON.stringify(event.payload),
        deviceId,
        nextClock.get(event.entityType, event.entityId),
        clock.now().toISOString(),
      );
    },
    recordAudit(event: AuditEventInput): void {
      insertAudit.run(
        uuidv7(),
        event.profileId,
        clock.now().toISOString(),
        event.action,
        event.entityType,
        event.entityId,
        event.reason ?? null,
        event.correlationId ?? null,
        event.details === undefined ? null : JSON.stringify(event.details),
      );
    },
  };
}
