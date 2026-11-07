import type { SupplierDto, SupplierKind } from '../shared/ipc';

/**
 * Клиентская валидация формы поставщика. Зеркало ограничений домена catalog
 * (core-modules §3: UI объясняет ошибку до отправки, но окончательно решает main).
 * Дубли названий разрешены: предупреждение о совпадении — подсказка, а не блокировка.
 */
export const SUPPLIER_NAME_MAX = 200;
export const SUPPLIER_CONTACTS_MAX = 500;
export const SUPPLIER_NOTE_MAX = 2_000;

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  uk: 'УК',
  tsj: 'ТСЖ',
  rso: 'РСО',
  other: 'Другое',
};

export const SUPPLIER_KIND_OPTIONS: ReadonlyArray<{ value: SupplierKind; label: string }> = [
  { value: 'uk', label: SUPPLIER_KIND_LABELS.uk },
  { value: 'tsj', label: SUPPLIER_KIND_LABELS.tsj },
  { value: 'rso', label: SUPPLIER_KIND_LABELS.rso },
  { value: 'other', label: SUPPLIER_KIND_LABELS.other },
];

const SUPPLIER_KIND_VALUES: readonly string[] = ['uk', 'tsj', 'rso', 'other'];

export function isSupplierKindValue(value: unknown): value is SupplierKind {
  return typeof value === 'string' && SUPPLIER_KIND_VALUES.includes(value);
}

export interface SupplierFormValues {
  name: string;
  kind: SupplierKind | '';
  contacts: string;
  note: string;
}

export type SupplierFormErrors = Partial<Record<keyof SupplierFormValues, string>>;

export interface ParsedSupplierForm {
  name: string;
  kind: SupplierKind;
  contacts: string | null;
  note: string | null;
}

export function emptySupplierForm(): SupplierFormValues {
  return { name: '', kind: 'uk', contacts: '', note: '' };
}

export function formValuesFromSupplier(supplier: SupplierDto): SupplierFormValues {
  return {
    name: supplier.name,
    kind: supplier.kind,
    contacts: supplier.contacts ?? '',
    note: supplier.note ?? '',
  };
}

export function isSupplierFormDirty(
  initial: SupplierFormValues,
  current: SupplierFormValues,
): boolean {
  return (
    initial.name !== current.name ||
    initial.kind !== current.kind ||
    initial.contacts !== current.contacts ||
    initial.note !== current.note
  );
}

const FORM_KEYS: readonly (keyof SupplierFormValues)[] = ['name', 'kind', 'contacts', 'note'];

export interface SupplierValidationResult {
  errors: SupplierFormErrors;
  parsed: ParsedSupplierForm | null;
}

export function validateSupplierForm(values: SupplierFormValues): SupplierValidationResult {
  const errors: SupplierFormErrors = {};
  const name = values.name.trim();
  const contacts = values.contacts.trim();
  const note = values.note.trim();

  if (name.length === 0) errors.name = 'Укажите название поставщика';
  else if (name.length > SUPPLIER_NAME_MAX) {
    errors.name = `Название: не длиннее ${SUPPLIER_NAME_MAX} символов`;
  }

  if (!isSupplierKindValue(values.kind)) errors.kind = 'Выберите тип поставщика';

  if (contacts.length > SUPPLIER_CONTACTS_MAX) {
    errors.contacts = `Контакты: не длиннее ${SUPPLIER_CONTACTS_MAX} символов`;
  }
  if (note.length > SUPPLIER_NOTE_MAX) {
    errors.note = `Заметка: не длиннее ${SUPPLIER_NOTE_MAX} символов`;
  }

  if (FORM_KEYS.some((key) => errors[key] !== undefined) || !isSupplierKindValue(values.kind)) {
    return { errors, parsed: null };
  }
  return {
    errors,
    parsed: {
      name,
      kind: values.kind,
      contacts: contacts === '' ? null : contacts,
      note: note === '' ? null : note,
    },
  };
}

/** Ключ сравнения названий: trim + нижний регистр — как supplierNameKey в main. */
export function supplierNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Совпадения по названию для предупреждения о дубле: архивные тоже считаются,
 * редактируемая запись — нет. Пустое название дублем не считается.
 */
export function findSupplierNameDuplicates(
  name: string,
  suppliers: readonly SupplierDto[],
  currentId?: string,
): SupplierDto[] {
  const key = supplierNameKey(name);
  if (key === '') return [];
  return suppliers.filter((supplier) => supplier.nameKey === key && supplier.id !== currentId);
}
