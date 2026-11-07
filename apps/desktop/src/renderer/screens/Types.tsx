import { useEffect, useState } from 'react';
import { ErrorBanner } from '../components';
import { IpcError, toUiError } from '../api';
import { useDeletePropertyType, usePropertyTypes } from '../catalog';
import { useSession } from '../session';
import { Icon } from '../icons';

/**
 * Справочник типов объекта (S-04a): типы, которые выбираются в карточке объекта.
 * Удалить можно только незадействованный тип; занятый показывает, какие объекты
 * его используют, и кнопка удаления заблокирована (правило живёт в main).
 */
export function Types() {
  const sessionId = useSession((state) => state.sessionId);
  const expireSession = useSession((state) => state.expireSession);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof toUiError> | null>(null);

  const typesQuery = usePropertyTypes(sessionId);
  const deleteType = useDeletePropertyType(sessionId);
  const unauthorized =
    typesQuery.error instanceof IpcError && typesQuery.error.code === 'UNAUTHENTICATED';

  useEffect(() => {
    if (unauthorized) expireSession('Сессия истекла: войдите снова');
  }, [unauthorized, expireSession]);

  if (sessionId === null) return null;

  const types = typesQuery.data ?? [];
  const loading = typesQuery.isLoading;

  const remove = async (id: string) => {
    setActionError(null);
    try {
      await deleteType.mutateAsync(id);
      setConfirmId(null);
    } catch (error) {
      setConfirmId(null);
      setActionError(toUiError(error));
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
              return (
                <li key={type.id} className="type-row">
                  <span className="name">{type.name}</span>
                  <span className="type-usage">
                    {used === 0 ? 'Не используется' : `${used} ${pluralObjects(used)}`}
                    {usedBy.length === 0 ? null : (
                      <span className="type-used-by" title={usedBy.join(', ')}>
                        {usedBy.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="type-action">
                    {used === 0 ? (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setActionError(null);
                          setConfirmId(type.id);
                        }}
                      >
                        <Icon name="trash" />
                        Удалить
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled
                        title="Удалить тип можно, только когда им не пользуется ни один объект"
                      >
                        <Icon name="trash" />
                        Удалить
                      </button>
                    )}
                  </span>
                  {confirmId === type.id ? (
                    <div
                      className="inline-confirm"
                      role="group"
                      aria-label="Подтверждение удаления типа"
                    >
                      <span className="grow" role="status">
                        Удалить тип «{type.name}»? Действие необратимо.
                      </span>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setConfirmId(null)}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => void remove(type.id)}
                        disabled={deleteType.isPending}
                        aria-busy={deleteType.isPending}
                      >
                        <Icon name="trash" />
                        {deleteType.isPending ? 'Удаление…' : 'Удалить'}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function pluralObjects(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'объект';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'объекта';
  return 'объектов';
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
