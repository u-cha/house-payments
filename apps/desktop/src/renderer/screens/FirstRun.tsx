import { useState, type FormEvent } from 'react';
import { ErrorBanner, TitleBar } from '../components';
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
    <>
      <TitleBar section="Первый запуск" />
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
            <h1>Первый запуск</h1>
            <p className="auth-profile">Профиль владельца нужен для входа и аудита</p>
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="owner-name">Имя профиля</label>
                <input
                  id="owner-name"
                  name="profileName"
                  value={name}
                  autoComplete="username"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="owner-password">Пароль</label>
                <input
                  id="owner-password"
                  name="password"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="field-hint">Не короче 8 символов.</p>
              </div>
              <div className="field">
                <label htmlFor="owner-confirmation">Повторите пароль</label>
                <input
                  id="owner-confirmation"
                  name="passwordConfirmation"
                  type="password"
                  value={confirmation}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {localError === null ? (
                <ErrorBanner error={error} />
              ) : (
                <p className="alert" role="alert">
                  {localError}
                </p>
              )}
              <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
                {busy ? 'Создание…' : 'Создать профиль'}
              </button>
            </form>
          </div>
        </div>
        <div className="auth-foot">
          <span>Файл данных создаётся автоматически</span>
        </div>
      </main>
    </>
  );
}
