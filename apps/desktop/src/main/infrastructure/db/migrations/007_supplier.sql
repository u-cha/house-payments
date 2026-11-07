-- 007: справочник поставщиков (FR-02, model.dbml). Поставщик не удаляется:
-- is_active = 0 — архив, счета и история сохраняются.
-- name_key — trim + нижний регистр (кириллицу приводит JS); индекс НЕ unique:
-- дубли разрешены и лишь предупреждаются в UI (R-13).
CREATE TABLE supplier (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('uk', 'tsj', 'rso', 'other')),
  contacts TEXT,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Обычный индекс: exact match по name_key для предупреждения о дубле.
CREATE INDEX supplier_name_key ON supplier (name_key);
