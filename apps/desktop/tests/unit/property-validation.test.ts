import { describe, expect, it } from 'vitest';
import type { PropertyDto } from '../../src/shared/ipc';
import {
  emptyPropertyForm,
  formValuesFromProperty,
  formatSharePercent,
  validatePropertyForm,
} from '../../src/renderer/property-validation';

const base = {
  typeId: 'type-1',
  label: 'Квартира 12',
  address: 'Карабайка, 36',
  areaM2: '54,3',
  sharePercent: '100',
};

describe('клиентская валидация формы объекта', () => {
  it('принимает корректные значения и нормализует запятую в площади', () => {
    const result = validatePropertyForm(base);
    expect(result.errors).toEqual({});
    expect(result.parsed).toEqual({
      typeId: 'type-1',
      label: 'Квартира 12',
      address: 'Карабайка, 36',
      areaM2: 54.3,
      shareBp: 10_000,
    });
  });

  it('пустая площадь допустима, доля по умолчанию — 100%', () => {
    const result = validatePropertyForm(emptyPropertyForm('type-1'));
    expect(result.errors).toMatchObject({
      label: expect.any(String),
      address: expect.any(String),
    });
    expect(result.parsed).toBeNull();

    const noArea = validatePropertyForm({ ...base, areaM2: '   ' });
    expect(noArea.parsed).toMatchObject({ areaM2: null });
  });

  it('переводит проценты доли в базисные пункты без потери точности', () => {
    expect(validatePropertyForm({ ...base, sharePercent: '25' }).parsed?.shareBp).toBe(2_500);
    expect(validatePropertyForm({ ...base, sharePercent: '0,01' }).parsed?.shareBp).toBe(1);
    expect(validatePropertyForm({ ...base, sharePercent: '33,33' }).parsed?.shareBp).toBe(3_333);
  });

  it('объясняет каждую ошибку до отправки в main', () => {
    const result = validatePropertyForm({
      typeId: '',
      label: ' ',
      address: '',
      areaM2: 'abc',
      sharePercent: '0',
    });
    expect(result.parsed).toBeNull();
    expect(result.errors).toMatchObject({
      label: expect.any(String),
      typeId: expect.any(String),
      address: expect.any(String),
      areaM2: expect.any(String),
      sharePercent: expect.any(String),
    });

    expect(validatePropertyForm({ ...base, areaM2: '0' }).errors.areaM2).toBeDefined();
    expect(validatePropertyForm({ ...base, areaM2: '1,234' }).errors.areaM2).toBeDefined();
    expect(validatePropertyForm({ ...base, areaM2: '1000001' }).errors.areaM2).toBeDefined();
    expect(
      validatePropertyForm({ ...base, sharePercent: '100,01' }).errors.sharePercent,
    ).toBeDefined();
    expect(validatePropertyForm({ ...base, sharePercent: '' }).errors.sharePercent).toBeDefined();
    expect(validatePropertyForm({ ...base, label: 'x'.repeat(121) }).errors.label).toBeDefined();
  });
});

describe('форма из существующего объекта', () => {
  it('показывает площадь и долю в человекочитаемом виде', () => {
    const property: PropertyDto = {
      id: 'property-1',
      typeId: 'type-1',
      typeName: 'Квартира',
      label: 'Квартира 12',
      address: 'Карабайка, 36',
      areaM2: 54.3,
      shareBp: 2_500,
      note: null,
      status: 'active',
      createdAt: '2026-11-06T10:00:00.000Z',
    };
    expect(formValuesFromProperty(property)).toEqual({
      label: 'Квартира 12',
      typeId: 'type-1',
      address: 'Карабайка, 36',
      areaM2: '54,3',
      sharePercent: '25',
    });
    expect(formatSharePercent(1)).toBe('0,01');
    expect(formatSharePercent(10_000)).toBe('100');
  });
});
