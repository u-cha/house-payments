import { useState, type FormEvent } from 'react';
import { ErrorBanner, TitleBar } from '../components';
import { useSession } from '../session';

/** S-01: вход по паролю; в v1 профиль один, поэтому выбор профиля не нужен. */
export function Login() {
  const { profile, busy, error, login, clearError } = useSession();
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void login(password);
  };

  return (
    <>
      <TitleBar section="Вход" />
      <main className="screen auth-screen" id="main">
        <div className="auth-layout">
          <div className="auth-mast">
            <div className="auth-word" translate="no">
              house-
              <br />
              payments
            </div>
            <p className="auth-sub">Учёт платежей за жильё</p>
            <div className="auth-rule" />
          </div>
          <div className="auth-divider" aria-hidden="true" />
          <div className="auth-form">
            <h1>Вход</h1>
            <p className="auth-profile">
              Профиль: <strong>{profile?.name ?? 'Владелец'}</strong>
            </p>
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="login-password">Пароль</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  autoFocus
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error !== null) clearError();
                  }}
                />
              </div>
              <ErrorBanner error={error} />
              <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
                {busy ? 'Вход…' : 'Войти'}
              </button>
            </form>
          </div>
        </div>
        <div className="auth-foot">
          <span>Данные хранятся только на этом компьютере</span>
        </div>
      </main>
    </>
  );
}
