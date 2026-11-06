import { describe, expect, it, vi } from 'vitest';
import { registerApp } from '../../src/main/ipc/app.js';
import { APP_QUIT_CHANNEL } from '../../src/shared/ipc.js';

const electronMock = vi.hoisted(() => ({ on: vi.fn(), quit: vi.fn() }));

vi.mock('electron', () => ({
  app: { quit: electronMock.quit },
  ipcMain: { on: electronMock.on },
}));

describe('app IPC', () => {
  it('handles app:quit by quitting the whole app, not just the window', () => {
    registerApp();
    expect(electronMock.on).toHaveBeenCalledWith(APP_QUIT_CHANNEL, expect.any(Function));

    const handler = electronMock.on.mock.calls.at(-1)?.[1] as () => void;
    handler();
    expect(electronMock.quit).toHaveBeenCalledTimes(1);
  });
});
