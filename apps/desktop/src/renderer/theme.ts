/**
 * Выбор темы оформления (docs/design/ux/design-system.md §6.3): светлая,
 * тёмная или системная. Предпочтение хранится в localStorage, а не в файле
 * данных: это настройка рабочего места, а не доменное состояние. Системная
 * тема разрешается через prefers-color-scheme; новых IPC-каналов не нужно.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'house-payments.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** По умолчанию — светлая: это согласованное визуальное направление. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Приватный режим или запрет хранилища не мешает работе: тема живёт в памяти.
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Атрибут на <html> переключает набор токенов в styles.css. */
export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset['theme'] = resolveTheme(preference);
}

export function watchSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
