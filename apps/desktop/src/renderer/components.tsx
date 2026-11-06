import { useEffect, useState, type ReactNode } from 'react';
import type { UiError } from './api';
import { useSession } from './session';
import {
  applyTheme,
  readThemePreference,
  storeThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from './theme';

const SUN = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const MOON = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M13 9.6A5.4 5.4 0 0 1 6.4 3a5.4 5.4 0 1 0 6.6 6.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const SYSTEM = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect
      x="2"
      y="3"
      width="12"
      height="8"
      rx="1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path d="M6 13.5h4M8 11v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Светлая тема', icon: SUN },
  { value: 'dark', label: 'Тёмная тема', icon: MOON },
  { value: 'system', label: 'Как в системе', icon: SYSTEM },
];

/**
 * Переключатель темы: светлая, тёмная, системная. Живёт в шапке окна, поэтому
 * доступен на всех экранах. Выбор хранится в localStorage; в системном режиме
 * тема следует за ОС через prefers-color-scheme.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [preference]);

  const choose = (next: ThemePreference): void => {
    setPreference(next);
    storeThemePreference(next);
    applyTheme(next);
  };

  return (
    <div className="theme-switch" role="group" aria-label="Тема оформления">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="theme-option"
          aria-pressed={preference === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => choose(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

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
      <span className="titlebar-crumb">{section}</span>
      <span className="titlebar-brand" translate="no">
        house-payments
      </span>
      <span className="titlebar-spacer" />
      <ThemeToggle />
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
