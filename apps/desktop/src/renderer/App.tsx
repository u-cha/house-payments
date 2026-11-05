import { useEffect, useState } from 'react';
import type { PingResult } from '../shared/ipc';

export function App() {
  const [ping, setPing] = useState<PingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.ping().then(setPing, (reason: unknown) => setError(String(reason)));
  }, []);

  const nodeLeaked = 'require' in window || 'process' in window;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>house-payments</h1>
      <p>Версия приложения: {ping?.version ?? '…'}</p>
      <p>IPC ping: {error ? `ошибка: ${error}` : ping ? `ok (${ping.version})` : 'ожидание…'}</p>
      <p>Изоляция renderer: {nodeLeaked ? 'НАРУШЕНА' : 'в порядке — require/process недоступны'}</p>
    </main>
  );
}
