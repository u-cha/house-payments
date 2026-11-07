// Домен catalog: поставщик услуг — УК, ТСЖ, РСО или другая организация
// (FR-02, entities.md §2). Поставщик не удаляется: архив скрывает его из выбора,
// счета и история сохраняются.
export const SUPPLIER_KINDS = ['uk', 'tsj', 'rso', 'other'] as const;

export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export interface Supplier {
  id: string;
  name: string;
  /** Ключ сравнения названий: trim + нижний регистр (дубли разрешены). */
  nameKey: string;
  kind: SupplierKind;
  contacts: string | null;
  note: string | null;
  /** false — в архиве: скрыт из выбора, но остаётся в истории. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MAX_SUPPLIER_NAME_LENGTH = 200;
export const MAX_SUPPLIER_CONTACTS_LENGTH = 500;
export const MAX_SUPPLIER_NOTE_LENGTH = 2_000;

export function isSupplierKind(value: unknown): value is SupplierKind {
  return typeof value === 'string' && (SUPPLIER_KINDS as readonly string[]).includes(value);
}

/** Название хранится и показывается как ввёл пользователь, без пробелов по краям. */
export function normalizeSupplierName(name: string): string {
  return name.trim();
}

/**
 * Ключ дубля: trim + нижний регистр. Кириллицу приводит JS: SQLite `lower()`
 * без ICU её не понимает (та же причина, что у property_type.name_key).
 */
export function supplierNameKey(name: string): string {
  return normalizeSupplierName(name).toLowerCase();
}
