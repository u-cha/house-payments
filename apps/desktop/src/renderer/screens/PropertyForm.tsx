import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { PropertyDto, PropertyTypeDto } from '../../shared/ipc';
import { ErrorBanner } from '../components';
import { toUiError } from '../api';
import { useCreateProperty, useCreatePropertyType, useUpdateProperty } from '../catalog';
import {
  emptyPropertyForm,
  formValuesFromProperty,
  TYPE_NAME_MAX,
  validatePropertyForm,
  type PropertyFormErrors,
  type PropertyFormValues,
} from '../property-validation';

export interface PropertyFormProps {
  sessionId: string;
  types: PropertyTypeDto[];
  property?: PropertyDto | undefined;
  onCancel(): void;
  onSaved(property: PropertyDto): void;
}

/**
 * S-05 в части формы: создание и редактирование объекта. Все ограничения
 * продублированы на клиенте для подсказок, окончательно их проверяет main.
 */
export function PropertyForm({ sessionId, types, property, onCancel, onSaved }: PropertyFormProps) {
  const [values, setValues] = useState<PropertyFormValues>(() =>
    property ? formValuesFromProperty(property) : emptyPropertyForm(types[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const [addingType, setAddingType] = useState(false);
  const [typeName, setTypeName] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);

  const createProperty = useCreateProperty(sessionId);
  const updateProperty = useUpdateProperty(sessionId);
  const createType = useCreatePropertyType(sessionId);
  const saving = createProperty.isPending || updateProperty.isPending;
  const saveError = createProperty.error ?? updateProperty.error;

  const field = (name: keyof PropertyFormValues) => ({
    id: `property-${name}`,
    value: values[name],
    'aria-invalid': errors[name] !== undefined,
    'aria-describedby': errors[name] === undefined ? undefined : `property-${name}-error`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [name]: next }));
      if (errors[name] !== undefined) setErrors((current) => ({ ...current, [name]: undefined }));
    },
  });

  const addType = async () => {
    const name = typeName.trim();
    if (name.length === 0) return setTypeError('Укажите название типа');
    if (name.length > TYPE_NAME_MAX) {
      return setTypeError(`Название типа: не длиннее ${TYPE_NAME_MAX} символов`);
    }
    setTypeError(null);
    try {
      const created = await createType.mutateAsync({ name });
      setValues((current) => ({ ...current, typeId: created.id }));
      setTypeName('');
      setAddingType(false);
    } catch (error) {
      setTypeError(toUiError(error).message);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validatePropertyForm(values);
    setErrors(result.errors);
    if (result.parsed === null) return;
    const input = result.parsed;
    if (property === undefined) {
      createProperty.mutate(input, { onSuccess: onSaved });
    } else {
      updateProperty.mutate({ id: property.id, ...input }, { onSuccess: onSaved });
    }
  };

  return (
    <section className="card property-form" aria-labelledby="property-form-title">
      <h2 id="property-form-title">{property === undefined ? 'Новый объект' : 'Объект'}</h2>
      <form onSubmit={submit} noValidate>
        <label htmlFor="property-label">Название</label>
        <input
          {...field('label')}
          type="text"
          autoFocus
          placeholder="Например, Карабайка 36, кв. 12"
        />
        <FieldError name="label" errors={errors} />

        <label htmlFor="property-typeId">Тип объекта</label>
        <div className="type-row">
          <select {...field('typeId')}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost plus"
            aria-label="Добавить новый тип"
            title="Добавить новый тип"
            onClick={() => {
              setAddingType((open) => !open);
              setTypeError(null);
            }}
          >
            +
          </button>
        </div>
        <FieldError name="typeId" errors={errors} />

        {addingType ? (
          <div className="new-type" role="group" aria-label="Новый тип объекта">
            <label htmlFor="new-type-name">Новый тип</label>
            <input
              id="new-type-name"
              value={typeName}
              maxLength={TYPE_NAME_MAX}
              placeholder="Например, Гараж"
              onChange={(event) => {
                setTypeName(event.target.value);
                setTypeError(null);
              }}
            />
            <div className="actions">
              <button type="button" onClick={() => void addType()} disabled={createType.isPending}>
                {createType.isPending ? 'Добавление…' : 'Добавить тип'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setAddingType(false);
                  setTypeName('');
                  setTypeError(null);
                }}
              >
                Отмена
              </button>
            </div>
            {typeError === null ? null : (
              <p className="error" role="alert">
                {typeError}
              </p>
            )}
          </div>
        ) : null}

        <label htmlFor="property-address">Адрес</label>
        <input {...field('address')} type="text" placeholder="Например, Карабайка, 36" />
        <FieldError name="address" errors={errors} />

        <label htmlFor="property-areaM2">Площадь, м²</label>
        <input {...field('areaM2')} type="text" inputMode="decimal" placeholder="Необязательно" />
        <FieldError name="areaM2" errors={errors} />

        <label htmlFor="property-sharePercent">Доля владения, %</label>
        <input {...field('sharePercent')} type="text" inputMode="decimal" />
        <p className="hint">От 0,01 до 100. 100% — объект целиком.</p>
        <FieldError name="sharePercent" errors={errors} />

        <ErrorBanner error={saveError === null ? null : toUiError(saveError)} />
        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : property === undefined ? 'Создать объект' : 'Сохранить'}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}

function FieldError({
  name,
  errors,
}: {
  name: keyof PropertyFormValues;
  errors: PropertyFormErrors;
}) {
  const message = errors[name];
  if (message === undefined) return null;
  return (
    <p className="field-error" id={`property-${name}-error`} role="alert">
      {message}
    </p>
  );
}
