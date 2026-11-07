import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { PropertyDto, PropertyTypeDto } from '../../shared/ipc';
import { ErrorBanner } from '../components';
import { Icon } from '../icons';
import { Select } from '../select';
import { toUiError } from '../api';
import {
  useArchiveProperty,
  useCreateProperty,
  useRestoreProperty,
  useUpdateProperty,
} from '../catalog';
import {
  DRAFT_TYPE_ID,
  emptyPropertyForm,
  formValuesFromProperty,
  isPropertyFormDirty,
  TYPE_NAME_MAX,
  typeInputFromForm,
  validatePropertyForm,
  type PropertyFormErrors,
  type PropertyFormValues,
} from '../property-validation';

export interface PropertyFormProps {
  sessionId: string;
  types: PropertyTypeDto[];
  property?: PropertyDto | undefined;
  onClose(): void;
}

/**
 * S-05 в части формы: создание, просмотр и правка объекта. Экран показывает
 * лист поверх реестра, а не карточку над списком; все ограничения продублированы
 * на клиенте для подсказок, окончательно их проверяет main.
 */
export function PropertyForm({ sessionId, types, property, onClose }: PropertyFormProps) {
  // Снимок состояния на момент открытия: guard сравнивает с ним текущие значения.
  const [initialValues] = useState<PropertyFormValues>(() =>
    property ? formValuesFromProperty(property) : emptyPropertyForm(types[0]?.id ?? ''),
  );
  const [values, setValues] = useState<PropertyFormValues>(initialValues);
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const [addingType, setAddingType] = useState(false);
  const [typeName, setTypeName] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);
  // Тип, выбранный в форме, но ещё не созданный: справочник пополнится только
  // при сохранении объекта, поэтому «Выйти без сохранения» ничего не оставит.
  const [draftTypeName, setDraftTypeName] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  const createProperty = useCreateProperty(sessionId);
  const updateProperty = useUpdateProperty(sessionId);
  const archive = useArchiveProperty(sessionId);
  const restore = useRestoreProperty(sessionId);

  const readOnly = property?.status === 'archived';
  const saving = createProperty.isPending || updateProperty.isPending;
  const saveError = createProperty.error ?? updateProperty.error;
  const actionError = archive.error ?? restore.error;
  const title = property === undefined ? 'Новый объект' : property.label;

  const dirty = useMemo(
    () => isPropertyFormDirty(initialValues, values, { addingType, typeName, draftTypeName }),
    [addingType, draftTypeName, initialValues, typeName, values],
  );

  /** Закрытие по инициативе пользователя: при изменениях сначала спрашиваем. */
  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmArchive(false);
    setConfirmDiscard(true);
  };

  const focusFormStart = () => {
    document.getElementById('property-label')?.focus();
  };

  /** «Продолжить редактирование»: закрыть подтверждение и вернуть фокус в форму. */
  const keepEditing = () => {
    setConfirmDiscard(false);
    focusFormStart();
  };

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving || event.defaultPrevented) return;
      if (confirmDiscard) {
        keepEditing();
        return;
      }
      if (confirmArchive) {
        setConfirmArchive(false);
        return;
      }
      if (dirty) {
        setConfirmArchive(false);
        setConfirmDiscard(true);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [confirmArchive, confirmDiscard, dirty, onClose, saving]);

  const field = (name: keyof PropertyFormValues) => ({
    id: `property-${name}`,
    name,
    value: values[name],
    disabled: readOnly === true,
    'aria-invalid': errors[name] !== undefined,
    'aria-describedby': errors[name] === undefined ? undefined : `property-${name}-error`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [name]: next }));
      if (errors[name] !== undefined) setErrors((current) => ({ ...current, [name]: undefined }));
    },
  });

  const addType = () => {
    const name = typeName.trim();
    if (name.length === 0) return setTypeError('Укажите название типа');
    if (name.length > TYPE_NAME_MAX) {
      return setTypeError(`Название типа: не длиннее ${TYPE_NAME_MAX} символов`);
    }
    setTypeError(null);
    setAddingType(false);
    setTypeName('');
    // Одноимённый тип уже есть — выбираем его: main поступит так же при
    // сохранении, поэтому в справочнике не появится второй «Гараж».
    const existing = types.find((type) => type.name.toLowerCase() === name.toLowerCase());
    setDraftTypeName(existing === undefined ? name : null);
    setValues((current) => ({
      ...current,
      typeId: existing === undefined ? DRAFT_TYPE_ID : existing.id,
    }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const result = validatePropertyForm(values);
    setErrors(result.errors);
    if (result.parsed === null) {
      const first = Object.keys(result.errors)[0];
      if (first !== undefined) document.getElementById(`property-${first}`)?.focus();
      return;
    }
    const { label, address, areaM2, shareBp, typeId } = result.parsed;
    const typeFields = typeInputFromForm(typeId, draftTypeName);
    const input = { label, address, areaM2, shareBp, ...typeFields };
    if (property === undefined) {
      createProperty.mutate(input, { onSuccess: onClose });
    } else {
      updateProperty.mutate({ id: property.id, ...input }, { onSuccess: onClose });
    }
  };

  const archiveNow = async () => {
    if (property === undefined) return;
    try {
      await archive.mutateAsync(property.id);
      onClose();
    } catch {
      setConfirmArchive(false);
    }
  };

  const restoreNow = async () => {
    if (property === undefined) return;
    try {
      await restore.mutateAsync(property.id);
      onClose();
    } catch {
      // Текст ошибки показывает ErrorBanner из состояния мутации.
    }
  };

  return (
    <section aria-labelledby="property-form-title">
      <div className="crumbs">
        <button type="button" onClick={requestClose}>
          Объекты
        </button>
        <span className="sep">/</span>
        <span className="current">{title}</span>
      </div>
      <div className="sheet-head">
        <h1 id="property-form-title">{title}</h1>
      </div>
      <div className="doublerule" />

      <form className="form-sheet" onSubmit={submit} noValidate>
        {readOnly ? (
          <p className="form-status">
            Объект в архиве: параметры только для чтения. Верните его в активные, чтобы изменить.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="property-label">Название</label>
          <input
            {...field('label')}
            type="text"
            autoFocus={readOnly !== true}
            placeholder="Например, Карабайка 36, кв. 12"
          />
          <FieldError name="label" errors={errors} />
        </div>

        <div className="field">
          <label htmlFor="property-typeId">Тип объекта</label>
          <div className="type-line">
            <Select
              id="property-typeId"
              name="typeId"
              value={values.typeId}
              placeholder="Выберите тип"
              options={[
                ...types.map((type) => ({ value: type.id, label: type.name })),
                ...(draftTypeName === null ? [] : [{ value: DRAFT_TYPE_ID, label: draftTypeName }]),
              ]}
              disabled={readOnly === true}
              invalid={errors.typeId !== undefined}
              describedBy={errors.typeId === undefined ? undefined : 'property-typeId-error'}
              onChange={(next) => {
                if (next !== DRAFT_TYPE_ID) setDraftTypeName(null);
                setValues((current) => ({ ...current, typeId: next }));
                if (errors.typeId !== undefined) {
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.typeId;
                    return next;
                  });
                }
              }}
            />
            {readOnly ? null : (
              <button
                type="button"
                className="plus"
                aria-label="Добавить новый тип"
                title="Добавить новый тип"
                onClick={() => {
                  setAddingType((open) => !open);
                  setTypeError(null);
                }}
              >
                <Icon name="plus" size={14} />
              </button>
            )}
          </div>
          <FieldError name="typeId" errors={errors} />
          {types.length === 0 && draftTypeName === null ? (
            <p className="field-hint">В справочнике нет типов — добавьте новый через «+».</p>
          ) : null}
          {draftTypeName === null ? null : (
            <p className="field-hint" role="status">
              Тип «{draftTypeName}» появится в справочнике после сохранения объекта.
            </p>
          )}
        </div>

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
            <div className="form-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setAddingType(false);
                  setTypeName('');
                  setTypeError(null);
                }}
              >
                Отмена
              </button>
              <button type="button" className="btn" onClick={addType}>
                Добавить тип
              </button>
            </div>
            {typeError === null ? null : (
              <p className="alert" role="alert">
                {typeError}
              </p>
            )}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="property-address">Адрес</label>
          <input {...field('address')} type="text" placeholder="Например, Карабайка, 36" />
          <FieldError name="address" errors={errors} />
        </div>

        <div className="row2">
          <div className="field">
            <label htmlFor="property-areaM2">Площадь, м²</label>
            <input
              {...field('areaM2')}
              type="text"
              inputMode="decimal"
              placeholder="Необязательно"
            />
            <FieldError name="areaM2" errors={errors} />
          </div>
          <div className="field">
            <label htmlFor="property-sharePercent">Доля владения, %</label>
            <input {...field('sharePercent')} type="text" inputMode="decimal" />
            <p className="field-hint">От 0,01 до 100. 100% — объект целиком.</p>
            <FieldError name="sharePercent" errors={errors} />
          </div>
        </div>

        <ErrorBanner error={saveError === null ? null : toUiError(saveError)} />
        <ErrorBanner error={actionError === null ? null : toUiError(actionError)} />

        {readOnly ? (
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={requestClose}>
              Закрыть
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void restoreNow()}
              disabled={restore.isPending}
              aria-busy={restore.isPending}
            >
              <Icon name="restore" />
              {restore.isPending ? 'Возврат…' : 'Вернуть в активные'}
            </button>
          </div>
        ) : (
          <div className="form-actions">
            {property === undefined ? null : (
              <button
                type="button"
                className="btn danger start"
                onClick={() => setConfirmArchive(true)}
              >
                <Icon name="archive" />В архив
              </button>
            )}
            <button type="button" className="btn ghost" onClick={requestClose} disabled={saving}>
              Отмена
            </button>
            <button type="submit" className="btn" disabled={saving} aria-busy={saving}>
              {saving ? 'Сохранение…' : property === undefined ? 'Создать объект' : 'Сохранить'}
            </button>
          </div>
        )}

        {confirmArchive ? (
          <div className="inline-confirm" role="group" aria-label="Подтверждение архивации">
            <span className="grow" role="status">
              Объект уйдёт в архив и станет только для чтения.
            </span>
            <button type="button" className="btn ghost" onClick={() => setConfirmArchive(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => void archiveNow()}
              disabled={archive.isPending}
              aria-busy={archive.isPending}
            >
              <Icon name="archive" />
              {archive.isPending ? 'Архивация…' : 'В архив'}
            </button>
          </div>
        ) : null}

        {confirmDiscard ? (
          <div
            className="inline-confirm"
            role="group"
            aria-label="Подтверждение выхода без сохранения"
          >
            <span className="grow" role="status">
              Изменения не сохранены.
            </span>
            <button type="button" className="btn ghost" ref={keepEditingRef} onClick={keepEditing}>
              Продолжить редактирование
            </button>
            <button type="button" className="btn danger" onClick={onClose}>
              Выйти без сохранения
            </button>
          </div>
        ) : null}
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
