import { describe, expect, it } from 'vitest';
import {
  MAX_SUPPLIER_CONTACTS_LENGTH,
  MAX_SUPPLIER_NAME_LENGTH,
  MAX_SUPPLIER_NOTE_LENGTH,
  SUPPLIER_KINDS,
  isSupplierKind,
  normalizeSupplierName,
  supplierNameKey,
} from '../../src/main/modules/catalog/domain/supplier';

describe('домен поставщика: нормализация названия', () => {
  it('убирает пробелы по краям, но сохраняет написание', () => {
    expect(normalizeSupplierName('  УК «Карабайка»\t')).toBe('УК «Карабайка»');
    expect(normalizeSupplierName('ТСЖ')).toBe('ТСЖ');
    expect(normalizeSupplierName('   ')).toBe('');
  });

  it('строит name_key в нижнем регистре, включая кириллицу', () => {
    expect(supplierNameKey('  УК «Карабайка»  ')).toBe('ук «карабайка»');
    // Регистр не важен: одинаковые названия дают один ключ для предупреждения о дубле.
    expect(supplierNameKey('РСО Энерго')).toBe(supplierNameKey('  рсо энерго '));
  });
});

describe('домен поставщика: тип и границы полей', () => {
  it('знает четыре типа поставщика и отвергает остальные', () => {
    expect(SUPPLIER_KINDS).toEqual(['uk', 'tsj', 'rso', 'other']);
    for (const kind of SUPPLIER_KINDS) expect(isSupplierKind(kind)).toBe(true);
    for (const value of ['УК', 'uk ', '', null, undefined, 1]) {
      expect(isSupplierKind(value)).toBe(false);
    }
  });

  it('фиксирует границы длины постановки: название 200, контакты 500, заметка 2000', () => {
    expect(MAX_SUPPLIER_NAME_LENGTH).toBe(200);
    expect(MAX_SUPPLIER_CONTACTS_LENGTH).toBe(500);
    expect(MAX_SUPPLIER_NOTE_LENGTH).toBe(2_000);
  });
});
