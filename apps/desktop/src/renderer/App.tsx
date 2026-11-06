import { useEffect, type ReactNode } from 'react';
import { TitleBar } from './components';
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

  let screen: ReactNode;
  if (phase === 'loading') {
    screen = (
      <>
        <TitleBar section="Загрузка" />
        <main className="loading-screen" id="main" aria-busy="true">
          <p>Загрузка…</p>
        </main>
      </>
    );
  } else if (phase === 'first-run') {
    screen = <FirstRun />;
  } else if (phase === 'login') {
    screen = <Login />;
  } else {
    screen = <Shell />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        К содержанию
      </a>
      {screen}
    </div>
  );
}
