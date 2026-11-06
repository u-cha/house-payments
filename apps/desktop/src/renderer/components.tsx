import type { UiError } from './api';

/** Ошибка показывается текстом AppError и кодом; traceId помогает в журнале main. */
export function ErrorBanner({ error }: { error: UiError | null }) {
  if (error === null) return null;
  return (
    <p className="error" role="alert" data-code={error.code}>
      {error.message}
      {error.code === 'UNKNOWN' ? null : <span className="error-code"> ({error.code})</span>}
    </p>
  );
}
