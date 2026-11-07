import { describe, expect, it } from 'vitest';
import type { SupplierDto } from '../../src/shared/ipc';
import {
  emptySupplierForm,
  findSupplierNameDuplicates,
  formValuesFromSupplier,
  isSupplierFormDirty,
  SUPPLIER_KIND_LABELS,
  validateSupplierForm,
} from '../../src/renderer/supplier-validation';

const supplier: SupplierDto = {
  id: 'supplier-1',
  name: 'УК «Карабайка»',
  nameKey: 'ук «карабайка»',
  kind: 'uk',
  contacts: '+7 900 000-00-00',
  note: null,
  isActive: true,
  createdAt: '2026-11-07T10:00:00.000Z',
  updatedAt: '2026-11-07T10:00:00.000Z',
};

describe('формы поставщика: валидация', () => {
  it('требует название и по умолчанию предлагает тип УК', () => {
    const result = validateSupplierForm(emptySupplierForm());
    expect(result.parsed).toBeNull();
    expect(result.errors.name).toBeDefined();
    expect(emptySupplierForm().kind).toBe('uk');
  });

  it('обрезает пробелы, а пустые контакты и заметку отправляет как null', () => {
    const result = validateSupplierForm({
      name: '  РСО Энерго  ',
      kind: 'rso',
      contacts: '  +7 900 000-00-00  ',
      note: '   ',
    });
    expect(result.errors).toEqual({});
    expect(result.parsed).toEqual({
      name: 'РСО Энерго',
      kind: 'rso',
      contacts: '+7 900 000-00-00',
      note: null,
    });
  });

  it('объясняет превышение длины каждого поля', () => {
    const long = validateSupplierForm({
      name: 'x'.repeat(201),
      kind: 'other',
      contacts: 'x'.repeat(501),
      note: 'x'.repeat(2001),
    });
    expect(long.parsed).toBeNull();
    expect(long.errors).toMatchObject({
      name: expect.any(String),
      contacts: expect.any(String),
      note: expect.any(String),
    });
  });

  it('отвергает неизвестный тип поставщика', () => {
    const result = validateSupplierForm({
      name: 'ООО «Ромашка»',
      kind: 'unknown' as never,
      contacts: '',
      note: '',
    });
    expect(result.parsed).toBeNull();
    expect(result.errors.kind).toBeDefined();
  });

  it('подписывает четыре типа поставщика по-русски', () => {
    expect(SUPPLIER_KIND_LABELS).toEqual({
      uk: 'УК',
      tsj: 'ТСЖ',
      rso: 'РСО',
      other: 'Другое',
    });
  });
});

describe('форма поставщика: предупреждение о дубле', () => {
  it('находит дубль без учёта регистра и пробелов, включая архивные', () => {
    const archived: SupplierDto = { ...supplier, id: 'supplier-2', isActive: false };
    expect(findSupplierNameDuplicates('  ук «КАРАБАЙКА» ', [supplier, archived])).toEqual([
      supplier,
      archived,
    ]);
    expect(findSupplierNameDuplicates('РСО Энерго', [supplier])).toEqual([]);
  });

  it('не считает дублем редактируемую запись и пустое название', () => {
    expect(findSupplierNameDuplicates('УК «Карабайка»', [supplier], supplier.id)).toEqual([]);
    expect(findSupplierNameDuplicates('   ', [supplier])).toEqual([]);
  });
});

describe('форма поставщика: значения и guard несохранённых изменений', () => {
  it('переносит запись в значения формы', () => {
    expect(formValuesFromSupplier(supplier)).toEqual({
      name: 'УК «Карабайка»',
      kind: 'uk',
      contacts: '+7 900 000-00-00',
      note: '',
    });
  });

  it('считает изменением правку любого поля', () => {
    const initial = formValuesFromSupplier(supplier);
    expect(isSupplierFormDirty(initial, initial)).toBe(false);
    expect(isSupplierFormDirty(initial, { ...initial, note: 'звонок в бухгалтерию' })).toBe(true);
  });
});
