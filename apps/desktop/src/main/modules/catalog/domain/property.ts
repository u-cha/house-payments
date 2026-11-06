// Домен catalog: объект недвижимости и тип объекта (FR-01, entities.md §2).
// Снаружи это «объект»; в коде — property, чтобы имя совпадало со схемой.
export type PropertyStatus = 'active' | 'archived';

export interface Property {
  id: string;
  typeId: string;
  label: string;
  address: string;
  areaM2: number | null;
  shareBp: number;
  note: string | null;
  status: PropertyStatus;
  createdAt: string;
}

export interface PropertyType {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

/**
 * Единое написание названия типа: нижний регистр и без внешних пробелов.
 * Так тип хранится, так его показывает UI; уникальность — по этому же ключу
 * (кириллицу приводит JS, SQLite `lower()` без ICU — нет).
 */
export function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase();
}

export const MAX_LABEL_LENGTH = 120;
export const MAX_ADDRESS_LENGTH = 300;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TYPE_NAME_LENGTH = 60;
export const MAX_AREA_M2 = 1_000_000;
export const MIN_SHARE_BP = 1;
export const MAX_SHARE_BP = 10_000;
export const DEFAULT_SHARE_BP = 10_000;
export const DEFAULT_TYPE_SORT_ORDER = 100;
