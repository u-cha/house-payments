import { useEffect } from 'react';
import { FirstRun } from './screens/FirstRun';
import { Login } from './screens/Login';
import { Shell } from './screens/Shell';
import { useSession } from './session';

/** Выбор экрана по состоянию сессии: первый запуск → вход → каркас. */
export function App() {
  const phase = useSession((state) => state.phase);
  const bootstrap = useSession((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'loading') return <p className="muted">Загрузка…</p>;
  if (phase === 'first-run') return <FirstRun />;
  if (phase === 'login') return <Login />;
  return <Shell />;
}
