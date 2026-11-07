import { describe, expect, it } from 'vitest';
import type { PropertyDto } from '../../src/shared/ipc';
import {
  DRAFT_TYPE_ID,
  emptyPropertyForm,
  formValuesFromProperty,
  formatAreaDisplay,
  formatSharePercent,
  isPropertyFormDirty,
  typeInputFromForm,
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

describe('форматирование площади в реестре', () => {
  it('разделяет разряды и сохраняет запятую для дробной части', () => {
    expect(formatAreaDisplay(1200)).toBe('1\u00a0200');
    expect(formatAreaDisplay(54.2)).toBe('54,2');
    expect(formatAreaDisplay(null)).toBe('');
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

describe('guard несохранённых изменений формы', () => {
  const initial = emptyPropertyForm('type-1');
  const emptyDraft = { addingType: false, typeName: '' };
  const property: PropertyDto = {
    id: 'property-1',
    typeId: 'type-1',
    typeName: 'Квартира',
    label: 'Квартира 12',
    address: 'Карабайка, 36',
    areaM2: 54.3,
    shareBp: 10_000,
    note: null,
    status: 'active',
    createdAt: '2026-11-06T10:00:00.000Z',
  };

  it('чистая форма без черновика типа не считается изменённой', () => {
    expect(isPropertyFormDirty(initial, { ...initial }, emptyDraft)).toBe(false);
  });

  it('изменение любого поля делает форму «грязной»', () => {
    expect(isPropertyFormDirty(initial, { ...initial, label: 'Квартира' }, emptyDraft)).toBe(true);
    expect(isPropertyFormDirty(initial, { ...initial, typeId: 'type-2' }, emptyDraft)).toBe(true);
    expect(isPropertyFormDirty(initial, { ...initial, address: 'Адрес' }, emptyDraft)).toBe(true);
    expect(isPropertyFormDirty(initial, { ...initial, areaM2: '54,3' }, emptyDraft)).toBe(true);
    expect(isPropertyFormDirty(initial, { ...initial, sharePercent: '25' }, emptyDraft)).toBe(true);
  });

  it('открытая форма нового типа или введённое имя типа — тоже изменения', () => {
    expect(isPropertyFormDirty(initial, { ...initial }, { addingType: true, typeName: '' })).toBe(
      true,
    );
    expect(
      isPropertyFormDirty(initial, { ...initial }, { addingType: false, typeName: 'Гараж' }),
    ).toBe(true);
    expect(
      isPropertyFormDirty(initial, { ...initial }, { addingType: true, typeName: 'Гараж' }),
    ).toBe(true);
  });

  it('возврат к исходным значениям и пустому черновику снова делает форму чистой', () => {
    const changed = { ...initial, label: 'Квартира', areaM2: '54,3' };
    expect(isPropertyFormDirty(initial, changed, { addingType: true, typeName: 'Гараж' })).toBe(
      true,
    );
    expect(isPropertyFormDirty(initial, { ...changed, ...initial }, emptyDraft)).toBe(false);
  });

  it('снимок существующего объекта не «грязный», пока значения не изменили', () => {
    const snapshot = formValuesFromProperty(property);
    expect(isPropertyFormDirty(snapshot, { ...snapshot }, emptyDraft)).toBe(false);
    expect(
      isPropertyFormDirty(snapshot, { ...snapshot, address: 'Другой адрес' }, emptyDraft),
    ).toBe(true);
  });
});

describe('черновик нового типа в форме', () => {
  const initial = emptyPropertyForm('type-1');

  it('выбранный черновик уходит в main как имя, а не как выдуманный id', () => {
    expect(typeInputFromForm(DRAFT_TYPE_ID, 'Гараж')).toEqual({ newTypeName: 'Гараж' });
    expect(typeInputFromForm('type-1', null)).toEqual({ typeId: 'type-1' });
  });

  it('выбранный черновик делает форму изменённой и переживает выбор другого типа', () => {
    expect(
      isPropertyFormDirty(
        initial,
        { ...initial, typeId: DRAFT_TYPE_ID },
        {
          addingType: false,
          typeName: '',
          draftTypeName: 'Гараж',
        },
      ),
    ).toBe(true);
    expect(
      isPropertyFormDirty(
        initial,
        { ...initial, typeId: 'type-1' },
        {
          addingType: false,
          typeName: '',
          draftTypeName: null,
        },
      ),
    ).toBe(false);
  });
});
