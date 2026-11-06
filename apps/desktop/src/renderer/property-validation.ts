import type { PropertyDto } from '../shared/ipc';

/**
 * Клиентская валидация формы объекта. Это зеркало серверных ограничений
 * (catalog-service): UI объясняет ошибку до отправки, но окончательно решает main.
 */

// Зеркало ограничений домена catalog (core-modules §3: UI не владеет бизнес-правилами).
export const LABEL_MAX = 120;
export const ADDRESS_MAX = 300;
export const TYPE_NAME_MAX = 60;
export const AREA_MAX_M2 = 1_000_000;
export const SHARE_BP_MAX = 10_000;
export const DEFAULT_SHARE_BP = 10_000;

export interface PropertyFormValues {
  label: string;
  typeId: string;
  address: string;
  /** Площадь в м² как ввёл пользователь; пустая строка — «не указана». */
  areaM2: string;
  /** Доля владения в процентах; 100% — целый объект. */
  sharePercent: string;
}

export type PropertyFormErrors = Partial<Record<keyof PropertyFormValues, string>>;

export interface ParsedPropertyForm {
  label: string;
  typeId: string;
  address: string;
  areaM2: number | null;
  shareBp: number;
}

const DECIMAL = /^\d+(?:[.,]\d{1,2})?$/;

function parseDecimal(value: string): number | null {
  if (!DECIMAL.test(value.trim())) return null;
  return Number(value.trim().replace(',', '.'));
}

export function formatArea(areaM2: number | null): string {
  return areaM2 === null ? '' : String(areaM2).replace('.', ',');
}

/**
 * Площадь для чтения в реестре: разряды разделяются, дробная часть — запятая.
 * В поле формы идёт formatArea без разрядов: парсер не принимает пробелы.
 */
export function formatAreaDisplay(areaM2: number | null): string {
  if (areaM2 === null) return '';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(areaM2);
}

/** Базисные пункты → проценты без хвостовых нулей: 10000 → «100», 2500 → «25». */
export function formatSharePercent(shareBp: number): string {
  return String(shareBp / 100).replace('.', ',');
}

export function emptyPropertyForm(typeId = ''): PropertyFormValues {
  return {
    label: '',
    typeId,
    address: '',
    areaM2: '',
    sharePercent: formatSharePercent(DEFAULT_SHARE_BP),
  };
}

export function formValuesFromProperty(property: PropertyDto): PropertyFormValues {
  return {
    label: property.label,
    typeId: property.typeId,
    address: property.address,
    areaM2: formatArea(property.areaM2),
    sharePercent: formatSharePercent(property.shareBp),
  };
}

export interface ValidationResult {
  errors: PropertyFormErrors;
  parsed: ParsedPropertyForm | null;
}

export function validatePropertyForm(values: PropertyFormValues): ValidationResult {
  const errors: PropertyFormErrors = {};
  const label = values.label.trim();
  const address = values.address.trim();

  if (label.length === 0) errors.label = 'Укажите название объекта';
  else if (label.length > LABEL_MAX) errors.label = `Название: не длиннее ${LABEL_MAX} символов`;

  if (values.typeId.trim().length === 0) errors.typeId = 'Выберите тип объекта';

  if (address.length === 0) errors.address = 'Укажите адрес';
  else if (address.length > ADDRESS_MAX)
    errors.address = `Адрес: не длиннее ${ADDRESS_MAX} символов`;

  const areaText = values.areaM2.trim();
  let areaM2: number | null = null;
  if (areaText !== '') {
    const parsedArea = parseDecimal(areaText);
    if (parsedArea === null) {
      errors.areaM2 = 'Площадь: число с точкой или запятой, до двух знаков после';
    } else if (parsedArea <= 0 || parsedArea > AREA_MAX_M2) {
      errors.areaM2 = `Площадь: больше 0 и не больше ${AREA_MAX_M2} м²`;
    } else {
      areaM2 = parsedArea;
    }
  }

  const shareText = values.sharePercent.trim();
  let shareBp = DEFAULT_SHARE_BP;
  const parsedShare = parseDecimal(shareText);
  if (shareText === '' || parsedShare === null) {
    errors.sharePercent = 'Доля: число от 0,01 до 100';
  } else {
    shareBp = Math.round(parsedShare * 100);
    if (shareBp < 1 || shareBp > SHARE_BP_MAX) errors.sharePercent = 'Доля: от 0,01 до 100%';
  }

  if (Object.keys(errors).length > 0) return { errors, parsed: null };
  return { errors, parsed: { label, typeId: values.typeId, address, areaM2, shareBp } };
}
