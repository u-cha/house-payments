import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SupplierDto } from '../../shared/ipc';
import { ErrorBanner } from '../components';
import { Icon } from '../icons';
import { Select } from '../select';
import { toUiError } from '../api';
import {
  useArchiveSupplier,
  useCreateSupplier,
  useRestoreSupplier,
  useSupplierDuplicates,
  useUpdateSupplier,
} from '../catalog';
import {
  emptySupplierForm,
  findSupplierNameDuplicates,
  formValuesFromSupplier,
  isSupplierFormDirty,
  isSupplierKindValue,
  SUPPLIER_CONTACTS_MAX,
  SUPPLIER_KIND_OPTIONS,
  SUPPLIER_NAME_MAX,
  SUPPLIER_NOTE_MAX,
  validateSupplierForm,
  type SupplierFormErrors,
  type SupplierFormValues,
} from '../supplier-validation';

export interface SupplierFormProps {
  sessionId: string;
  supplier?: SupplierDto | undefined;
  onClose(): void;
}

/** Задержка поиска дублей: не дёргаем IPC на каждое нажатие клавиши. */
const DUPLICATE_LOOKUP_DELAY_MS = 300;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * S-06 в части формы: создание, правка, архив и возврат поставщика. Дубли
 * названий разрешены (R-13), поэтому совпадение — предупреждение, а не запрет
 * сохранения; окончательные ограничения проверяет main.
 */
export function SupplierForm({ sessionId, supplier, onClose }: SupplierFormProps) {
  const [initialValues] = useState<SupplierFormValues>(() =>
    supplier === undefined ? emptySupplierForm() : formValuesFromSupplier(supplier),
  );
  const [values, setValues] = useState<SupplierFormValues>(initialValues);
  const [errors, setErrors] = useState<SupplierFormErrors>({});
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  const createSupplier = useCreateSupplier(sessionId);
  const updateSupplier = useUpdateSupplier(sessionId);
  const archive = useArchiveSupplier(sessionId);
  const restore = useRestoreSupplier(sessionId);

  const readOnly = supplier?.isActive === false;
  const saving = createSupplier.isPending || updateSupplier.isPending;
  const saveError = createSupplier.error ?? updateSupplier.error;
  const actionError = archive.error ?? restore.error;
  const title = supplier === undefined ? 'Новый поставщик' : supplier.name;

  const debouncedName = useDebouncedValue(values.name, DUPLICATE_LOOKUP_DELAY_MS);
  const duplicatesQuery = useSupplierDuplicates(sessionId, readOnly ? '' : debouncedName);
  const duplicates = useMemo(
    () => findSupplierNameDuplicates(debouncedName, duplicatesQuery.data ?? [], supplier?.id),
    [debouncedName, duplicatesQuery.data, supplier?.id],
  );
  const duplicateWarning =
    !readOnly &&
    values.name.trim() !== '' &&
    debouncedName.trim().toLowerCase() === values.name.trim().toLowerCase() &&
    duplicates.length > 0;

  const dirty = useMemo(() => isSupplierFormDirty(initialValues, values), [initialValues, values]);

  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmArchive(false);
    setConfirmDiscard(true);
  };

  const focusFormStart = () => {
    document.getElementById('supplier-name')?.focus();
  };

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

  const field = (name: keyof SupplierFormValues) => ({
    id: `supplier-${name}`,
    name,
    value: values[name],
    disabled: readOnly === true,
    'aria-invalid': errors[name] !== undefined,
    'aria-describedby': errors[name] === undefined ? undefined : `supplier-${name}-error`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [name]: next }));
      if (errors[name] !== undefined) setErrors((current) => ({ ...current, [name]: undefined }));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const result = validateSupplierForm(values);
    setErrors(result.errors);
    if (result.parsed === null) {
      const first = Object.keys(result.errors)[0];
      if (first !== undefined) document.getElementById(`supplier-${first}`)?.focus();
      return;
    }
    const input = result.parsed;
    if (supplier === undefined) {
      createSupplier.mutate(input, { onSuccess: onClose });
    } else {
      updateSupplier.mutate({ id: supplier.id, ...input }, { onSuccess: onClose });
    }
  };

  const archiveNow = async () => {
    if (supplier === undefined) return;
    try {
      await archive.mutateAsync(supplier.id);
      onClose();
    } catch {
      setConfirmArchive(false);
    }
  };

  const restoreNow = async () => {
    if (supplier === undefined) return;
    try {
      await restore.mutateAsync(supplier.id);
      onClose();
    } catch {
      // Текст ошибки показывает ErrorBanner из состояния мутации.
    }
  };

  return (
    <section aria-labelledby="supplier-form-title">
      <div className="crumbs">
        <button type="button" onClick={requestClose}>
          Поставщики
        </button>
        <span className="sep">/</span>
        <span className="current">{title}</span>
      </div>
      <div className="sheet-head">
        <h1 id="supplier-form-title">{title}</h1>
      </div>
      <div className="doublerule" />

      <form className="form-sheet" onSubmit={submit} noValidate>
        {readOnly ? (
          <p className="form-status">
            Поставщик в архиве: параметры только для чтения. Верните его в активные, чтобы изменить.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="supplier-name">Название</label>
          <input
            {...field('name')}
            type="text"
            autoFocus={readOnly !== true}
            maxLength={SUPPLIER_NAME_MAX}
            placeholder="Например, УК «Карабайка»"
          />
          <FieldError name="name" errors={errors} />
          {duplicateWarning ? (
            <p className="field-hint duplicate-hint" role="status">
              Поставщик с таким названием уже есть — сохранить всё равно можно.
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="supplier-kind">Тип поставщика</label>
          <Select
            id="supplier-kind"
            name="kind"
            value={values.kind}
            placeholder="Выберите тип"
            options={SUPPLIER_KIND_OPTIONS.map((option) => ({ ...option }))}
            disabled={readOnly === true}
            invalid={errors.kind !== undefined}
            describedBy={errors.kind === undefined ? undefined : 'supplier-kind-error'}
            onChange={(next) => {
              if (!isSupplierKindValue(next)) return;
              setValues((current) => ({ ...current, kind: next }));
              if (errors.kind !== undefined) {
                setErrors((current) => {
                  const nextErrors = { ...current };
                  delete nextErrors.kind;
                  return nextErrors;
                });
              }
            }}
          />
          <FieldError name="kind" errors={errors} />
        </div>

        <div className="field">
          <label htmlFor="supplier-contacts">Контакты</label>
          <textarea
            {...field('contacts')}
            rows={2}
            maxLength={SUPPLIER_CONTACTS_MAX}
            placeholder="Телефон, почта, адрес — необязательно"
          />
          <FieldError name="contacts" errors={errors} />
        </div>

        <div className="field">
          <label htmlFor="supplier-note">Заметка</label>
          <textarea
            {...field('note')}
            rows={3}
            maxLength={SUPPLIER_NOTE_MAX}
            placeholder="Необязательно"
          />
          <FieldError name="note" errors={errors} />
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
            {supplier === undefined ? null : (
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
              {saving ? 'Сохранение…' : supplier === undefined ? 'Создать поставщика' : 'Сохранить'}
            </button>
          </div>
        )}

        {confirmArchive ? (
          <div className="inline-confirm" role="group" aria-label="Подтверждение архивации">
            <span className="grow" role="status">
              Поставщик уйдёт в архив и станет только для чтения.
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
  name: keyof SupplierFormValues;
  errors: SupplierFormErrors;
}) {
  const message = errors[name];
  if (message === undefined) return null;
  return (
    <p className="field-error" id={`supplier-${name}-error`} role="alert">
      {message}
    </p>
  );
}
