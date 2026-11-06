import { useEffect, useMemo, useState } from 'react';
import type { PropertyDto, PropertyStatus } from '../../shared/ipc';
import { ErrorBanner } from '../components';
import { IpcError, toUiError, type UiError } from '../api';
import {
  useArchiveProperty,
  useProperties,
  usePropertyTypes,
  useRestoreProperty,
} from '../catalog';
import { useSession } from '../session';
import { PropertyForm } from './PropertyForm';
import { formatArea, formatSharePercent } from '../property-validation';

type FormState = { mode: 'create' } | { mode: 'edit'; property: PropertyDto };

/**
 * S-04 «Объекты»: рабочий список и архив, поиск и фильтр по типу, действия
 * добавить/изменить/архивировать. Бизнес-правил нет — решение за main; экран
 * показывает результат и объясняет отказ (core-modules §3).
 */
export function Properties() {
  const sessionId = useSession((state) => state.sessionId);
  const expireSession = useSession((state) => state.expireSession);
  const [status, setStatus] = useState<PropertyStatus>('active');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [actionError, setActionError] = useState<UiError | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const typesQuery = usePropertyTypes(sessionId);
  const propertiesQuery = useProperties(
    sessionId,
    status,
    typeFilter === '' ? undefined : typeFilter,
  );
  const archive = useArchiveProperty(sessionId);
  const restore = useRestoreProperty(sessionId);

  const queryError = typesQuery.error ?? propertiesQuery.error;
  const unauthorized =
    isUnauthenticated(queryError) ||
    isUnauthenticated(archive.error) ||
    isUnauthenticated(restore.error);

  useEffect(() => {
    if (unauthorized) expireSession('Сессия истекла: войдите снова');
  }, [unauthorized, expireSession]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = propertiesQuery.data ?? [];
    if (query === '') return items;
    return items.filter(
      (property) =>
        property.label.toLowerCase().includes(query) ||
        property.address.toLowerCase().includes(query),
    );
  }, [propertiesQuery.data, search]);

  const types = typesQuery.data ?? [];
  const filtered = typeFilter !== '' || search.trim() !== '';
  const loading = typesQuery.isLoading || propertiesQuery.isLoading;

  const runAction = async (property: PropertyDto) => {
    setActionError(null);
    setPendingId(property.id);
    try {
      if (status === 'active') {
        if (!window.confirm(`Архивировать «${property.label}»?`)) return;
        await archive.mutateAsync(property.id);
      } else {
        await restore.mutateAsync(property.id);
      }
    } catch (error) {
      setActionError(toUiError(error));
    } finally {
      setPendingId(null);
    }
  };

  if (sessionId === null) return null;

  return (
    <section aria-labelledby="properties-title">
      <div className="page-head">
        <div>
          <h1 id="properties-title">Объекты</h1>
          <p className="muted">Квартиры, дома, машиноместа и участки, которыми вы владеете.</p>
        </div>
        <button
          type="button"
          disabled={types.length === 0}
          onClick={() => setForm({ mode: 'create' })}
        >
          Добавить объект
        </button>
      </div>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="properties-search">Поиск</label>
          <input
            id="properties-search"
            type="search"
            placeholder="Название или адрес"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="properties-type-filter">Тип</label>
          <select
            id="properties-type-filter"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">Все типы</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="tabs" role="group" aria-label="Статус объектов">
          <button
            type="button"
            className={status === 'active' ? 'nav-item active' : 'nav-item'}
            aria-pressed={status === 'active'}
            onClick={() => setStatus('active')}
          >
            Активные
          </button>
          <button
            type="button"
            className={status === 'archived' ? 'nav-item active' : 'nav-item'}
            aria-pressed={status === 'archived'}
            onClick={() => setStatus('archived')}
          >
            Архив
          </button>
        </div>
      </div>

      <ErrorBanner error={queryError === null ? null : toUiError(queryError)} />
      <ErrorBanner error={actionError} />
      {queryError === null ? null : (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void typesQuery.refetch();
            void propertiesQuery.refetch();
          }}
        >
          Повторить
        </button>
      )}

      {form === null ? null : (
        <PropertyForm
          key={form.mode === 'edit' ? form.property.id : 'new'}
          sessionId={sessionId}
          types={types}
          property={form.mode === 'edit' ? form.property : undefined}
          onCancel={() => setForm(null)}
          onSaved={() => setForm(null)}
        />
      )}

      {loading ? <p className="muted">Загрузка…</p> : null}

      {!loading && queryError === null && visible.length === 0 ? (
        <EmptyState
          status={status}
          filtered={filtered}
          onAdd={() => setForm({ mode: 'create' })}
          addDisabled={types.length === 0}
          onReset={() => {
            setSearch('');
            setTypeFilter('');
          }}
        />
      ) : null}

      {visible.length > 0 ? (
        <ul className="property-list">
          {visible.map((property) => (
            <li key={property.id} className="property-row">
              <div className="property-main">
                <strong>{property.label}</strong>
                <span className="badge">{property.typeName}</span>
                <span className="muted">{property.address}</span>
                <span className="muted">
                  {property.areaM2 === null
                    ? 'Площадь не указана'
                    : `${formatArea(property.areaM2)} м²`}
                  {' · '}
                  доля {formatSharePercent(property.shareBp)}%
                </span>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setForm({ mode: 'edit', property })}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={pendingId === property.id}
                  onClick={() => void runAction(property)}
                >
                  {status === 'active' ? 'В архив' : 'Вернуть'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof IpcError && error.code === 'UNAUTHENTICATED';
}

function EmptyState({
  status,
  filtered,
  onAdd,
  addDisabled,
  onReset,
}: {
  status: PropertyStatus;
  filtered: boolean;
  onAdd(): void;
  addDisabled: boolean;
  onReset(): void;
}) {
  if (filtered) {
    return (
      <div className="empty">
        <h2>Ничего не найдено</h2>
        <p className="muted">Измените запрос или сбросьте фильтр по типу.</p>
        <button type="button" className="ghost" onClick={onReset}>
          Сбросить фильтры
        </button>
      </div>
    );
  }
  if (status === 'archived') {
    return (
      <div className="empty">
        <h2>Архив пуст</h2>
        <p className="muted">Сюда попадают объекты, скрытые из рабочего списка.</p>
      </div>
    );
  }
  return (
    <div className="empty">
      <h2>Пока нет объектов</h2>
      <p className="muted">Добавьте первый объект — квартиру, дом, машиноместо или участок.</p>
      <button type="button" onClick={onAdd} disabled={addDisabled}>
        Добавить объект
      </button>
    </div>
  );
}
