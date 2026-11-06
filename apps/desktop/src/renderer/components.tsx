import type { UiError } from './api';
import { useSession } from './session';

/**
 * Заголовок окна (desktop-ui-electron, ADR-0020): системный светофор на macOS,
 * overlay на Windows/Linux. Полоса целиком — drag-регион, поэтому все кнопки
 * помечены no-drag в стилях: иначе они перестают нажиматься.
 */
export function TitleBar({ section }: { section: string }) {
  const profile = useSession((state) => state.profile);
  const quit = useSession((state) => state.quit);

  return (
    <header className="titlebar">
      <span className="titlebar-brand" translate="no">
        house-payments
      </span>
      <span className="titlebar-crumb">{section}</span>
      <span className="titlebar-spacer" />
      {profile === null ? null : (
        <>
          <span className="titlebar-user">{profile.name}</span>
          <button type="button" className="titlebar-quit" onClick={quit}>
            Выйти
          </button>
        </>
      )}
    </header>
  );
}

/** Ошибка показывается текстом AppError и кодом; traceId помогает в журнале main. */
export function ErrorBanner({ error }: { error: UiError | null }) {
  if (error === null) return null;
  return (
    <p className="alert" role="alert" data-code={error.code}>
      {error.message}
      {error.code === 'UNKNOWN' ? null : <span className="alert-code"> ({error.code})</span>}
    </p>
  );
}
