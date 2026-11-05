-- 003: профиль владельца (ADR-0006, model.dbml). Таблица `setting` создана в 001.
-- Пароль хранится только Argon2id-хешем (QS-05); роль готова к `member` без миграции.
CREATE TABLE profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX profile_role_active ON profile (role, is_active);
