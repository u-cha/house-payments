import { describe, expect, it, vi } from 'vitest';
import { createQuitController } from '../../src/main/lifecycle.js';

describe('quit confirmation', () => {
  it('keeps the app running when the user cancels', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const quit = vi.fn();
    const controller = createQuitController({ confirm, quit });

    await controller.request();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();
    expect(controller.quitting).toBe(false);
  });

  it('quits the whole app after confirmation and allows the real quit', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const quit = vi.fn();
    const controller = createQuitController({ confirm, quit });

    await controller.request();

    expect(quit).toHaveBeenCalledTimes(1);
    expect(controller.quitting).toBe(true);
  });

  it('opens only one dialog while confirmation is pending', async () => {
    let resolveConfirm: (value: boolean) => void = () => undefined;
    const confirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const quit = vi.fn();
    const controller = createQuitController({ confirm, quit });

    const first = controller.request();
    const second = controller.request();
    expect(confirm).toHaveBeenCalledTimes(1);

    resolveConfirm(false);
    await Promise.all([first, second]);
    expect(quit).not.toHaveBeenCalled();
  });
});
