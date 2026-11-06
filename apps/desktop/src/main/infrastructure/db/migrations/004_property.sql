-- 004: объекты и редактируемый справочник типов (FR-01, model.dbml).
-- Снаружи сущность называется «объект»; в коде и схеме — property/property_type.
-- Встроенные типы засеяны здесь; пользовательские добавляются use case-ами.
CREATE TABLE property_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;

INSERT INTO property_type (id, name, sort_order, is_active, created_at) VALUES
  ('0192c000-0000-7000-8000-000000000001', 'Квартира', 10, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0192c000-0000-7000-8000-000000000002', 'Дом', 20, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0192c000-0000-7000-8000-000000000003', 'Машиноместо', 30, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0192c000-0000-7000-8000-000000000004', 'Земельный участок', 40, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0192c000-0000-7000-8000-000000000005', 'Нежилое помещение', 50, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Статус «в архиве» скрывает объект из рабочего списка, но сохраняет историю
-- (FR-01: помещение архивируется, а не удаляется).
CREATE TABLE property (
  id TEXT PRIMARY KEY,
  type_id TEXT NOT NULL REFERENCES property_type(id),
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  area_m2 REAL CHECK (area_m2 IS NULL OR area_m2 > 0),
  share_bp INTEGER NOT NULL DEFAULT 10000 CHECK (share_bp BETWEEN 1 AND 10000),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX property_type_status ON property (type_id, status);
CREATE INDEX property_status ON property (status);
