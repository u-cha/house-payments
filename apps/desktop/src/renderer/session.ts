import { create } from 'zustand';
import type { ProfileDto } from '../shared/ipc';
import { api, toUiError, type UiError } from './api';

export type SessionPhase = 'loading' | 'first-run' | 'login' | 'authenticated';

interface SessionState {
  phase: SessionPhase;
  profile: ProfileDto | null;
  sessionId: string | null;
  busy: boolean;
  error: UiError | null;
  bootstrap(): Promise<void>;
  createOwner(name: string, password: string): Promise<void>;
  login(password: string): Promise<void>;
  /** Выход = полное завершение приложения, а не экран входа. */
  quit(): void;
  clearError(): void;
}

/**
 * Сессия renderer живёт только в памяти Zustand (ADR-0006): токен никуда не
 * сохраняется, после перезапуска bootstrap снова приведёт на экран входа.
 */
export const useSession = create<SessionState>((set) => ({
  phase: 'loading',
  profile: null,
  sessionId: null,
  busy: false,
  error: null,

  async bootstrap() {
    try {
      const status = await api.status();
      set({
        profile: status.profile,
        phase: status.needsOwner ? 'first-run' : 'login',
        error: null,
      });
    } catch (error) {
      set({ phase: 'login', error: toUiError(error) });
    }
  },

  async createOwner(name, password) {
    set({ busy: true, error: null });
    try {
      // Гейт V1: после создания профиля нужен явный вход на экране S-01.
      const profile = await api.createOwner({ name, password });
      set({ profile, phase: 'login', busy: false });
    } catch (error) {
      set({ busy: false, error: toUiError(error) });
    }
  },

  async login(password) {
    set({ busy: true, error: null });
    try {
      const session = await api.login({ password });
      set({
        profile: session.profile,
        sessionId: session.sessionId,
        phase: 'authenticated',
        busy: false,
      });
    } catch (error) {
      set({ busy: false, error: toUiError(error) });
    }
  },

  quit() {
    api.quit();
  },

  clearError() {
    set({ error: null });
  },
}));
