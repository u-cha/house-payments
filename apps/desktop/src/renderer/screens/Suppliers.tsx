import { useEffect, useMemo, useState } from 'react';
import type { SupplierDto } from '../../shared/ipc';
import { ErrorBanner } from '../components';
import { IpcError, toUiError } from '../api';
import { useSuppliers } from '../catalog';
import { useSession } from '../session';
import { SupplierForm } from './SupplierForm';
import { Icon } from '../icons';
import { Select } from '../select';
import {
  isSupplierKindValue,
  SUPPLIER_KIND_LABELS,
  SUPPLIER_KIND_OPTIONS,
} from '../supplier-validation';

type View = { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; supplier: SupplierDto };

/** Задержка поиска: main фильтрует список, не дёргаем IPC на каждую клавишу. */
const SEARCH_DELAY_MS = 250;

/**
 * S-06 «Поставщики»: реестр УК, ТСЖ, РСО и прочих организаций. Физического
 * удаления нет: архив скрывает запись из списка по умолчанию, но оставляет её в
 * истории. Дубли названий разрешены — об этом предупреждает только форма.
 */
export function Suppliers() {
  const sessionId = useSession((state) => state.sessionId);
  const expireSession = useSession((state) => state.expireSession);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [returnFocusId, setReturnFocusId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const filter = useMemo(
    () => ({
      includeArchived,
      ...(debouncedSearch.trim() === '' ? {} : { query: debouncedSearch.trim() }),
      ...(isSupplierKindValue(kindFilter) ? { kind: kindFilter } : {}),
    }),
    [debouncedSearch, includeArchived, kindFilter],
  );

  const suppliersQuery = useSuppliers(sessionId, filter);
  const queryError = suppliersQuery.error;
  const unauthorized = queryError instanceof IpcError && queryError.code === 'UNAUTHENTICATED';

  useEffect(() => {
    if (unauthorized) expireSession('Сессия истекла: войдите снова');
  }, [unauthorized, expireSession]);

  // Возврат фокуса на строку (или кнопку добавления), которая открыла лист.
  useEffect(() => {
    if (view.mode !== 'list' || returnFocusId === null) return;
    const selector =
      returnFocusId === 'new' ? '[data-add-supplier]' : `[data-supplier-id="${returnFocusId}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
    setReturnFocusId(null);
  }, [view.mode, returnFocusId]);

  const openCreate = (): void => {
    setReturnFocusId('new');
    setView({ mode: 'create' });
  };

  const openEdit = (supplier: SupplierDto): void => {
    setReturnFocusId(supplier.id);
    setView({ mode: 'edit', supplier });
  };

  const closeForm = (): void => setView({ mode: 'list' });

  const suppliers = suppliersQuery.data ?? [];
  const filtered = debouncedSearch.trim() !== '' || kindFilter !== '';
  const loading = suppliersQuery.isLoading;

  if (sessionId === null) return null;

  if (view.mode !== 'list') {
    return (
      <SupplierForm
        key={view.mode === 'edit' ? view.supplier.id : 'new'}
        sessionId={sessionId}
        supplier={view.mode === 'edit' ? view.supplier : undefined}
        onClose={closeForm}
      />
    );
  }

  return (
    <section aria-labelledby="suppliers-title">
      <div className="page-head">
        <div className="grow">
          <h1 id="suppliers-title">Поставщики</h1>
          <p>УК, ТСЖ, РСО и другие организации, с которыми вы ведёте расчёты.</p>
        </div>
        <button type="button" className="btn" data-add-supplier onClick={openCreate}>
          <Icon name="plus" />
          Добавить поставщика
        </button>
      </div>
      <div className="doublerule" />

      <div className="toolbar">
        <label className="visually-hidden" htmlFor="suppliers-search">
          Поиск по поставщикам
        </label>
        <input
          id="suppliers-search"
          name="search"
          className="input input-search"
          type="search"
          placeholder="Название поставщика"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="visually-hidden" htmlFor="suppliers-kind-filter">
          Тип поставщика
        </label>
        <Select
          id="suppliers-kind-filter"
          name="kindFilter"
          value={kindFilter}
          options={[{ value: '', label: 'Все типы' }, ...SUPPLIER_KIND_OPTIONS]}
          onChange={setKindFilter}
          ariaLabel="Тип поставщика"
        />
        <label className="toolbar-check">
          <input
            type="checkbox"
            name="includeArchived"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          <span>Показать архивные</span>
        </label>
      </div>

      <ErrorBanner error={queryError === null ? null : toUiError(queryError)} />
      {queryError === null ? null : (
        <button
          type="button"
          className="btn ghost retry"
          onClick={() => void suppliersQuery.refetch()}
        >
          Повторить
        </button>
      )}

      {loading ? <LedgerSkeleton /> : null}

      {!loading && queryError === null && suppliers.length === 0 ? (
        <EmptyState
          filtered={filtered}
          includeArchived={includeArchived}
          onAdd={openCreate}
          onReset={() => {
            setSearch('');
            setDebouncedSearch('');
            setKindFilter('');
          }}
        />
      ) : null}

      {!loading && suppliers.length > 0 ? (
        <>
          <div className="ledger-head ledger-suppliers" aria-hidden="true">
            <span>Название</span>
            <span>Тип</span>
            <span>Контакты</span>
            <span className="num">Лицевых счетов</span>
          </div>
          <ul className="ledger">
            {suppliers.map((supplier) => (
              <li key={supplier.id}>
                <button
                  type="button"
                  className="ledger-row ledger-suppliers"
                  data-supplier-id={supplier.id}
                  aria-label={`${supplier.name}, ${SUPPLIER_KIND_LABELS[supplier.kind]}${
                    supplier.contacts === null ? '' : `, ${supplier.contacts}`
                  }${supplier.isActive ? '' : ', в архиве'}`}
                  onClick={() => openEdit(supplier)}
                >
                  <span className="name">
                    {supplier.name}
                    {supplier.isActive ? null : <span className="badge-archive">в архиве</span>}
                  </span>
                  <span className="type">{SUPPLIER_KIND_LABELS[supplier.kind]}</span>
                  <span className="address">{supplier.contacts ?? '—'}</span>
                  <span className="num">—</span>
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
      <span className="visually-hidden">Загрузка поставщиков…</span>
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

function EmptyState({
  filtered,
  includeArchived,
  onAdd,
  onReset,
}: {
  filtered: boolean;
  includeArchived: boolean;
  onAdd(): void;
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
  if (includeArchived) {
    return (
      <div className="empty">
        <h2>Архив пуст</h2>
        <p>Сюда попадают поставщики, скрытые из рабочего списка.</p>
      </div>
    );
  }
  return (
    <div className="empty">
      <h2>Пока нет поставщиков</h2>
      <p>Добавьте УК, ТСЖ, РСО или другую организацию — с ней будут связаны счета.</p>
      <button type="button" className="btn" onClick={onAdd}>
        <Icon name="plus" />
        Добавить поставщика
      </button>
    </div>
  );
}
