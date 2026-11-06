import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '../components';
import { useSession } from '../session';

/** S-02: первый запуск — создание единственного профиля owner. */
export function FirstRun() {
  const { busy, error, createOwner } = useSession();
  const [name, setName] = useState('Владелец');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return setLocalError('Укажите имя профиля');
    if (password.length < 8) return setLocalError('Пароль: не короче 8 символов');
    if (password !== confirmation) return setLocalError('Пароли не совпадают');
    setLocalError(null);
    void createOwner(name.trim(), password);
  };

  return (
    <main className="auth">
      <h1>Первый запуск</h1>
      <p className="muted">
        Создайте профиль владельца — он нужен для входа и записи действий в аудит.
      </p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="owner-name">Имя профиля</label>
        <input
          id="owner-name"
          value={name}
          autoComplete="username"
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="owner-password">Пароль</label>
        <input
          id="owner-password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="hint">Не короче 8 символов.</p>
        <label htmlFor="owner-confirmation">Повторите пароль</label>
        <input
          id="owner-confirmation"
          type="password"
          value={confirmation}
          autoComplete="new-password"
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {localError === null ? (
          <ErrorBanner error={error} />
        ) : (
          <p className="error" role="alert">
            {localError}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Создание…' : 'Создать профиль'}
        </button>
      </form>
    </main>
  );
}
