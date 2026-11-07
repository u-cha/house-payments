import { useEffect, useState } from 'react';
import { ErrorBanner } from '../components';
import { IpcError, toUiError } from '../api';
import { useDeletePropertyType, usePropertyTypes } from '../catalog';
import { useSession } from '../session';
import { Icon } from '../icons';

/**
 * Справочник типов объекта (S-04a): типы, которые выбираются в карточке объекта.
 * У занятого типа показываем только счётчик активных/архивных объектов, который
 * раскрывает их список; корзина есть лишь у свободного типа и удаляет сразу
 * (правило «нельзя удалить занятый» живёт в main).
 */
export function Types() {
  const sessionId = useSession((state) => state.sessionId);
  const expireSession = useSession((state) => state.expireSession);
  const [openUsageId, setOpenUsageId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof toUiError> | null>(null);

  const typesQuery = usePropertyTypes(sessionId);
  const deleteType = useDeletePropertyType(sessionId);
  const unauthorized =
    typesQuery.error instanceof IpcError && typesQuery.error.code === 'UNAUTHENTICATED';

  useEffect(() => {
    if (unauthorized) expireSession('Сессия истекла: войдите снова');
  }, [unauthorized, expireSession]);

  // Всплывающий список объектов закрывается кликом мимо и Esc.
  useEffect(() => {
    if (openUsageId === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      if ((event.target as Element | null)?.closest('.type-usage-wrap') !== null) return;
      setOpenUsageId(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenUsageId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openUsageId]);

  if (sessionId === null) return null;

  const types = typesQuery.data ?? [];
  const loading = typesQuery.isLoading;

  const remove = async (id: string) => {
    setActionError(null);
    setPendingId(id);
    try {
      await deleteType.mutateAsync(id);
    } catch (error) {
      setActionError(toUiError(error));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section aria-labelledby="types-title">
      <div className="page-head">
        <div className="grow">
          <h1 id="types-title">Типы объекта</h1>
          <p>Типы, которые можно выбрать в карточке объекта. Занятый тип удалить нельзя.</p>
        </div>
      </div>
      <div className="doublerule" />

      <ErrorBanner error={actionError} />
      {actionError === null ? null : (
        <button type="button" className="btn ghost retry" onClick={() => setActionError(null)}>
          Понятно
        </button>
      )}

      <ErrorBanner error={typesQuery.error === null ? null : toUiError(typesQuery.error)} />
      {typesQuery.error === null ? null : (
        <button type="button" className="btn ghost retry" onClick={() => void typesQuery.refetch()}>
          Повторить
        </button>
      )}

      {loading ? <TypesSkeleton /> : null}

      {!loading && typesQuery.error === null && types.length === 0 ? (
        <div className="empty">
          <h2>Типов пока нет</h2>
          <p>Новый тип создаётся в форме объекта: «+» в поле «Тип объекта».</p>
        </div>
      ) : null}

      {!loading && types.length > 0 ? (
        <>
          <div className="type-head" aria-hidden="true">
            <span>Тип</span>
            <span>Задействован</span>
            <span />
          </div>
          <ul className="ledger">
            {types.map((type) => {
              const used = type.usageCount;
              const usedBy = type.usedBy ?? [];
              const open = openUsageId === type.id;
              return (
                <li key={type.id} className="type-row">
                  <span className="name">{type.name}</span>
                  <span className="type-usage-wrap">
                    {used === 0 ? (
                      <span className="type-unused" aria-hidden="true">
                        —
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="type-usage-btn"
                        aria-expanded={open}
                        aria-controls={`type-usage-${type.id}`}
                        onClick={() => setOpenUsageId(open ? null : type.id)}
                      >
                        {usageLabel(type.activeCount, type.archivedCount)}
                      </button>
                    )}
                    {open ? (
                      <div
                        id={`type-usage-${type.id}`}
                        className="type-popover"
                        role="dialog"
                        aria-label={`Объекты типа «${type.name}»`}
                      >
                        <ul>
                          {usedBy.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </span>
                  <span className="type-action">
                    {used === 0 ? (
                      <button
                        type="button"
                        className="type-icon-btn"
                        aria-label={`Удалить тип «${type.name}»`}
                        title="Удалить тип"
                        onClick={() => void remove(type.id)}
                        disabled={pendingId === type.id}
                        aria-busy={pendingId === type.id}
                      >
                        <Icon name="trash" />
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** «2 активных · 1 в архиве»: архивные — тоже использование, поэтому видны всегда. */
function usageLabel(active: number, archived: number): string {
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} ${pluralActive(active)}`);
  if (archived > 0) parts.push(`${archived} в архиве`);
  return parts.join(' · ');
}

function pluralActive(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'активный';
  return 'активных';
}

function TypesSkeleton() {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="visually-hidden">Загрузка типов…</span>
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
