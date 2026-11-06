import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '../components';
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
    <main className="auth">
      <h1>Вход</h1>
      <p className="muted">
        Профиль: <strong>{profile?.name ?? 'Владелец'}</strong>
      </p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="login-password">Пароль</label>
        <input
          id="login-password"
          type="password"
          value={password}
          autoComplete="current-password"
          autoFocus
          onChange={(event) => {
            setPassword(event.target.value);
            if (error !== null) clearError();
          }}
        />
        <ErrorBanner error={error} />
        <button type="submit" disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
