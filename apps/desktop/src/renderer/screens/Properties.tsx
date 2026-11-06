import { useEffect, useMemo, useState } from 'react';
import type { PropertyDto, PropertyStatus } from '../../shared/ipc';
import { ErrorBanner } from '../components';
import { IpcError, toUiError } from '../api';
import { useProperties, usePropertyTypes } from '../catalog';
import { useSession } from '../session';
import { PropertyForm } from './PropertyForm';
import { formatAreaDisplay, formatSharePercent } from '../property-validation';

type View = { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; property: PropertyDto };

/**
 * S-04 «Объекты»: реестр объектов и архив, поиск и фильтр по типу. Бизнес-правил
 * нет — решение за main; экран показывает результат и объясняет отказ
 * (core-modules §3). Строка реестра открывает объект листом (S-05).
 */
export function Properties() {
  const sessionId = useSession((state) => state.sessionId);
  const expireSession = useSession((state) => state.expireSession);
  const [status, setStatus] = useState<PropertyStatus>('active');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ mode: 'list' });
  const [returnFocusId, setReturnFocusId] = useState<string | null>(null);

  const typesQuery = usePropertyTypes(sessionId);
  const propertiesQuery = useProperties(
    sessionId,
    status,
    typeFilter === '' ? undefined : typeFilter,
  );

  const queryError = typesQuery.error ?? propertiesQuery.error;
  const unauthorized = isUnauthenticated(queryError);

  useEffect(() => {
    if (unauthorized) expireSession('Сессия истекла: войдите снова');
  }, [unauthorized, expireSession]);

  // Возврат фокуса на строку (или кнопку добавления), которая открыла лист:
  // список размонтируется, поэтому ищем цель по data-атрибуту после рендера.
  useEffect(() => {
    if (view.mode !== 'list' || returnFocusId === null) return;
    const selector =
      returnFocusId === 'new' ? '[data-add-property]' : `[data-property-id="${returnFocusId}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
    setReturnFocusId(null);
  }, [view.mode, returnFocusId]);

  const openCreate = (): void => {
    setReturnFocusId('new');
    setView({ mode: 'create' });
  };

  const openEdit = (property: PropertyDto): void => {
    setReturnFocusId(property.id);
    setView({ mode: 'edit', property });
  };

  const closeForm = (): void => setView({ mode: 'list' });

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

  if (sessionId === null) return null;

  if (view.mode !== 'list') {
    return (
      <PropertyForm
        key={view.mode === 'edit' ? view.property.id : 'new'}
        sessionId={sessionId}
        types={types}
        property={view.mode === 'edit' ? view.property : undefined}
        onClose={closeForm}
      />
    );
  }

  return (
    <section aria-labelledby="properties-title">
      <div className="page-head">
        <div className="grow">
          <h1 id="properties-title">Объекты</h1>
          <p>Квартиры, дома, машиноместа и участки, которыми вы владеете.</p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={types.length === 0}
          data-add-property
          onClick={openCreate}
        >
          Добавить объект
        </button>
      </div>
      <div className="doublerule" />

      <div className="toolbar">
        <label className="visually-hidden" htmlFor="properties-search">
          Поиск по объектам
        </label>
        <input
          id="properties-search"
          name="search"
          className="input input-search"
          type="search"
          placeholder="Название или адрес"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="visually-hidden" htmlFor="properties-type-filter">
          Тип объекта
        </label>
        <select
          id="properties-type-filter"
          name="typeFilter"
          className="select"
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
        <div className="segmented" role="group" aria-label="Статус объектов">
          <button
            type="button"
            aria-pressed={status === 'active'}
            onClick={() => setStatus('active')}
          >
            Активные
          </button>
          <button
            type="button"
            aria-pressed={status === 'archived'}
            onClick={() => setStatus('archived')}
          >
            Архив
          </button>
        </div>
      </div>

      <ErrorBanner error={queryError === null ? null : toUiError(queryError)} />
      {queryError === null ? null : (
        <button
          type="button"
          className="btn ghost retry"
          onClick={() => {
            void typesQuery.refetch();
            void propertiesQuery.refetch();
          }}
        >
          Повторить
        </button>
      )}

      {loading ? <LedgerSkeleton /> : null}

      {!loading && queryError === null && visible.length === 0 ? (
        <EmptyState
          status={status}
          filtered={filtered}
          onAdd={openCreate}
          addDisabled={types.length === 0}
          onReset={() => {
            setSearch('');
            setTypeFilter('');
          }}
        />
      ) : null}

      {!loading && visible.length > 0 ? (
        <>
          <div className="ledger-head" aria-hidden="true">
            <span>Название</span>
            <span>Тип</span>
            <span>Адрес</span>
            <span className="num">Площадь</span>
            <span className="num">Доля</span>
          </div>
          <ul className="ledger">
            {visible.map((property) => (
              <li key={property.id}>
                <button
                  type="button"
                  className="ledger-row"
                  data-property-id={property.id}
                  aria-label={`${property.label}, ${property.typeName}, ${property.address}, площадь ${
                    property.areaM2 === null
                      ? 'не указана'
                      : `${formatAreaDisplay(property.areaM2)}\u00A0м²`
                  }, доля ${formatSharePercent(property.shareBp)}%`}
                  onClick={() => openEdit(property)}
                >
                  <span className="name">{property.label}</span>
                  <span className="type">{property.typeName}</span>
                  <span className="address">{property.address}</span>
                  <span className="num">
                    {property.areaM2 === null
                      ? '—'
                      : `${formatAreaDisplay(property.areaM2)}\u00A0м²`}
                  </span>
                  <span className="num">{formatSharePercent(property.shareBp)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function LedgerSkeleton() {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="visually-hidden">Загрузка объектов…</span>
      {[0, 1, 2].map((row) => (
        <div className="skeleton-row" key={row} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
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
        <p>Измените запрос или сбросьте фильтр по типу.</p>
        <button type="button" className="btn ghost" onClick={onReset}>
          Сбросить фильтры
        </button>
      </div>
    );
  }
  if (status === 'archived') {
    return (
      <div className="empty">
        <h2>Архив пуст</h2>
        <p>Сюда попадают объекты, скрытые из рабочего списка.</p>
      </div>
    );
  }
  return (
    <div className="empty">
      <h2>Пока нет объектов</h2>
      <p>Добавьте первый объект — квартиру, дом, машиноместо или участок.</p>
      <button type="button" className="btn" onClick={onAdd} disabled={addDisabled}>
        Добавить объект
      </button>
    </div>
  );
}
