import type { ReactNode } from 'react';

export type IconName =
  'home' | 'ledger' | 'tap' | 'receipt' | 'card' | 'plus' | 'archive' | 'restore';

/**
 * Набор линейных иконок (вариант 2 ревью): 20×20 viewBox, штрих 1,4 px,
 * currentColor, без заливок. Инлайновые SVG — без новых зависимостей.
 */
const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 8.5 10 3l7 5.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z" />,
  ledger: (
    <>
      <rect x="3" y="3.5" width="14" height="13" rx="1" />
      <path d="M3 8h14M3 12h14M7 3.5v13" />
    </>
  ),
  // Поставщики — водопроводный кран с каплей: среда — жильё и коммунальные услуги.
  tap: (
    <>
      <path d="M2 8h4" />
      <path d="M6 5.5h4V10H6z" />
      <path d="M8 5.5V3M6.5 3h3" />
      <path d="M10 8h2.5a1.5 1.5 0 0 1 1.5 1.5V11" />
      <path d="M14 12.6c.7.8 1 1.4 1 1.9a1 1 0 0 1-2 0c0-.5.3-1.1 1-1.9z" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h10v14l-2-1.5-2 1.5-2-1.5L7 17l-2-1.5z" />
      <path d="M8 7h4M8 10h4M8 13h2" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 9h14M6 12.5h3" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  archive: (
    <>
      <path d="M3 5h14v3H3z" />
      <path d="M5 8v9h10V8" />
      <path d="M8 11.5h4" />
    </>
  ),
  restore: (
    <>
      <path d="M4 10a6 6 0 1 0 2-4.5" />
      <path d="M4 4v3.5h3.5" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
