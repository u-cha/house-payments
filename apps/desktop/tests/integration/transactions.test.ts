import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDatabase, type AppDatabase } from '../../src/main/infrastructure/db/index.js';
import { createEventRecorder } from '../../src/main/infrastructure/db/event-recorder.js';
import { withTransaction } from '../../src/main/infrastructure/db/transaction.js';
import { FixedClock } from '../../src/main/shared/clock.js';
import type {
  AuditEventInput,
  DomainEventInput,
  EventRecorder,
} from '../../src/main/shared/events.js';

const NOW = '2026-11-05T12:00:00.000Z';
const SETTING_SQL = 'INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)';
const EVENT: DomainEventInput = {
  entityType: 'setting',
  entityId: 'theme',
  operation: 'upsert',
  payload: { value: 'dark' },
};
const AUDIT: AuditEventInput = {
  profileId: 'profile-1',
  action: 'setting.update',
  entityType: 'setting',
  entityId: 'theme',
};

const tempDirs: string[] = [];
let db: AppDatabase;
let recorder: EventRecorder;

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-tx-'));
  tempDirs.push(dir);
  db = openAppDatabase(path.join(dir, 'house-payments.hpd'));
  recorder = createEventRecorder(db, { deviceId: 'device-1', clock: new FixedClock(NOW) });
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function count(table: 'setting' | 'change_log' | 'audit_event'): number {
  return db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number;
}

describe('transactional writer', () => {
  it('commits state together with exactly one change_log event', () => {
    withTransaction(db, () => {
      db.prepare(SETTING_SQL).run('theme', 'dark', NOW);
      recorder.recordChange(EVENT);
    });

    expect(count('setting')).toBe(1);
    expect(count('change_log')).toBe(1);
    expect(db.prepare('SELECT * FROM change_log').get()).toMatchObject({
      entity_type: 'setting',
      entity_id: 'theme',
      operation: 'upsert',
      payload_json: '{"value":"dark"}',
      device_id: 'device-1',
      logical_clock: 1,
      occurred_at: NOW,
    });
  });

  it('rolls back state, change_log and audit when the transaction fails', () => {
    expect(() =>
      withTransaction(db, () => {
        db.prepare(SETTING_SQL).run('theme', 'dark', NOW);
        recorder.recordChange(EVENT);
        recorder.recordAudit(AUDIT);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(count('setting')).toBe(0);
    expect(count('change_log')).toBe(0);
    expect(count('audit_event')).toBe(0);
  });

  it('keeps the per-entity clock monotonic and both journals append-only', () => {
    withTransaction(db, () => recorder.recordChange(EVENT));
    withTransaction(db, () => recorder.recordChange(EVENT));
    withTransaction(db, () => recorder.recordAudit(AUDIT));

    expect(
      db.prepare('SELECT logical_clock FROM change_log ORDER BY logical_clock').pluck().all(),
    ).toEqual([1, 2]);
    const appendOnly = /append-only/;
    expect(() => db.prepare("UPDATE change_log SET operation = 'x'").run()).toThrow(appendOnly);
    expect(() => db.prepare('DELETE FROM change_log').run()).toThrow(appendOnly);
    expect(() => db.prepare("UPDATE audit_event SET action = 'x'").run()).toThrow(appendOnly);
  });
});
