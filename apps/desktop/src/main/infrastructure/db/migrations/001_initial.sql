-- 001: базовая схема. `setting` — владелец identity (core-modules §4, model.dbml).
CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
