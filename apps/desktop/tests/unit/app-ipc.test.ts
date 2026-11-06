import { describe, expect, it, vi } from 'vitest';
import { registerApp } from '../../src/main/ipc/app.js';
import { APP_QUIT_CHANNEL } from '../../src/shared/ipc.js';

const electronMock = vi.hoisted(() => ({ on: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { on: electronMock.on },
}));

describe('app IPC', () => {
  it('forwards app:quit to the shared confirmation controller', () => {
    const requestQuit = vi.fn();
    registerApp(requestQuit);
    expect(electronMock.on).toHaveBeenCalledWith(APP_QUIT_CHANNEL, expect.any(Function));

    const handler = electronMock.on.mock.calls.at(-1)?.[1] as () => void;
    handler();
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });
});
