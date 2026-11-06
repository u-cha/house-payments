import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../src/renderer/session';
import type { HousePaymentsApi, IpcErrorShape, ProfileDto } from '../../src/shared/ipc';

const profile: ProfileDto = { id: 'profile-1', name: 'Владелец', role: 'owner' };

const mockApi = {
  ping: vi.fn(),
  authStatus: vi.fn(),
  createOwner: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
};

const unauthorized: IpcErrorShape = {
  code: 'UNAUTHENTICATED',
  message: 'Неверное имя профиля или пароль',
  retryable: false,
  traceId: 'trace-1',
};

function resetSession(): void {
  useSession.setState({
    phase: 'loading',
    profile: null,
    sessionId: null,
    busy: false,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { window?: unknown }).window = { api: mockApi as unknown as HousePaymentsApi };
  resetSession();
});

describe('renderer session store (Zustand)', () => {
  it('first run → profile created → login → authenticated → logout', async () => {
    mockApi.authStatus.mockResolvedValue({ ok: true, data: { needsOwner: true, profile: null } });
    await useSession.getState().bootstrap();
    expect(useSession.getState().phase).toBe('first-run');

    mockApi.createOwner.mockResolvedValue({ ok: true, data: profile });
    await useSession.getState().createOwner('Владелец', 'correct horse battery staple');
    expect(useSession.getState()).toMatchObject({ phase: 'login', profile, busy: false });

    mockApi.login.mockResolvedValue({
      ok: true,
      data: { sessionId: 'session-1', profile },
    });
    await useSession.getState().login('correct horse battery staple');
    expect(useSession.getState()).toMatchObject({
      phase: 'authenticated',
      sessionId: 'session-1',
      profile,
    });

    await useSession.getState().logout();
    expect(useSession.getState()).toMatchObject({
      phase: 'login',
      sessionId: null,
      profile: null,
    });
    expect(mockApi.logout).toHaveBeenCalledWith('session-1');
  });

  it('shows AppError text and code, keeps the user on the login screen', async () => {
    mockApi.authStatus.mockResolvedValue({
      ok: true,
      data: { needsOwner: false, profile },
    });
    await useSession.getState().bootstrap();
    expect(useSession.getState().phase).toBe('login');

    mockApi.login.mockResolvedValue({ ok: false, error: unauthorized });
    await useSession.getState().login('wrong password');

    expect(useSession.getState()).toMatchObject({
      phase: 'login',
      busy: false,
      error: { message: unauthorized.message, code: 'UNAUTHENTICATED' },
    });
  });

  it('keeps the first-run screen with a readable error when creation fails', async () => {
    mockApi.authStatus.mockResolvedValue({ ok: true, data: { needsOwner: true, profile: null } });
    await useSession.getState().bootstrap();

    mockApi.createOwner.mockResolvedValue({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Владелец уже создан: в первой версии профиль owner один',
        retryable: false,
        traceId: 'trace-2',
      },
    });
    await useSession.getState().createOwner('Владелец', 'correct horse battery staple');

    expect(useSession.getState()).toMatchObject({
      phase: 'first-run',
      busy: false,
      error: { code: 'CONFLICT' },
    });
  });
});
