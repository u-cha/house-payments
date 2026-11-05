-- 002: журнал изменений и аудит (ADR-0005, core-modules §5/§7, INV-17/INV-18).
-- Обе таблицы append-only: UPDATE/DELETE запрещены триггерами, а не соглашением.
CREATE TABLE change_log (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation TEXT NOT NULL, payload_json TEXT NOT NULL, device_id TEXT NOT NULL,
  logical_clock INTEGER NOT NULL, occurred_at TEXT NOT NULL, synced_at TEXT
) STRICT;
CREATE UNIQUE INDEX change_log_entity_clock
  ON change_log (entity_type, entity_id, logical_clock);
CREATE INDEX change_log_synced_at ON change_log (synced_at);
CREATE TRIGGER change_log_no_update BEFORE UPDATE ON change_log
BEGIN SELECT RAISE(ABORT, 'change_log is append-only (INV-18)'); END;
CREATE TRIGGER change_log_no_delete BEFORE DELETE ON change_log
BEGIN SELECT RAISE(ABORT, 'change_log is append-only (INV-18)'); END;

CREATE TABLE audit_event (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  reason TEXT, correlation_id TEXT, details_json TEXT
) STRICT;
CREATE TRIGGER audit_event_no_update BEFORE UPDATE ON audit_event
BEGIN SELECT RAISE(ABORT, 'audit_event is append-only (INV-17)'); END;
CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON audit_event
BEGIN SELECT RAISE(ABORT, 'audit_event is append-only (INV-17)'); END;
