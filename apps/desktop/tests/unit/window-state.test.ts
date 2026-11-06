import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  WINDOW_STATE_FILE,
  isWindowStateVisible,
  loadWindowState,
  sanitizeWindowState,
  saveWindowState,
  windowStateFromBounds,
  windowStatePath,
  type WindowState,
} from '../../src/main/window-state';

const state: WindowState = { x: 120, y: 80, width: 1180, height: 760, isMaximized: false };

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'house-payments-window-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('sanitizeWindowState', () => {
  it('принимает корректное состояние и округляет координаты', () => {
    expect(
      sanitizeWindowState({ x: 10.4, y: 20.6, width: 1180, height: 760, isMaximized: true }),
    ).toEqual({ x: 10, y: 21, width: 1180, height: 760, isMaximized: true });
  });

  it('отбрасывает мусор и окна меньше минимума', () => {
    expect(sanitizeWindowState(null)).toBeNull();
    expect(sanitizeWindowState('window')).toBeNull();
    expect(
      sanitizeWindowState({ x: 0, y: 0, width: MIN_WINDOW_WIDTH - 1, height: 700 }),
    ).toBeNull();
    expect(
      sanitizeWindowState({ x: 0, y: 0, width: 900, height: MIN_WINDOW_HEIGHT - 1 }),
    ).toBeNull();
    expect(sanitizeWindowState({ x: '0', y: 0, width: 900, height: 640 })).toBeNull();
    expect(
      sanitizeWindowState({ x: 0, y: 0, width: 900, height: 640, isMaximized: 'yes' }),
    ).toEqual({ x: 0, y: 0, width: 900, height: 640, isMaximized: false });
  });
});

describe('isWindowStateVisible', () => {
  const display = { x: 0, y: 0, width: 1440, height: 900 };

  it('принимает окно, видимое на текущем дисплее', () => {
    expect(isWindowStateVisible(state, [display])).toBe(true);
  });

  it('принимает окно, частично ушедшее за край', () => {
    expect(isWindowStateVisible({ ...state, x: -600, y: -300 }, [display])).toBe(true);
  });

  it('отклоняет окно за пределами всех дисплеев', () => {
    expect(isWindowStateVisible({ ...state, x: 5000, y: 4000 }, [display])).toBe(false);
    expect(isWindowStateVisible({ ...state, x: -2000, y: 0 }, [display])).toBe(false);
  });

  it('принимает окно на втором дисплее', () => {
    const second = { x: 1440, y: 0, width: 1920, height: 1080 };
    expect(isWindowStateVisible({ ...state, x: 1500, y: 100 }, [display, second])).toBe(true);
  });

  it('без сведений о дисплеях не блокирует запуск', () => {
    expect(isWindowStateVisible(state, [])).toBe(true);
  });
});

describe('файл состояния', () => {
  it('сохраняет и читает состояние; имя файла закреплено', () => {
    const directory = temporaryDirectory();
    saveWindowState(directory, state);
    expect(readFileSync(path.join(directory, WINDOW_STATE_FILE), 'utf8')).toContain(
      '"width": 1180',
    );
    expect(loadWindowState(directory)).toEqual(state);
  });

  it('битый и отсутствующий файл не мешают запуску', () => {
    const directory = temporaryDirectory();
    expect(loadWindowState(directory)).toBeNull();
    writeFileSync(windowStatePath(directory), '{не json');
    expect(loadWindowState(directory)).toBeNull();
    writeFileSync(windowStatePath(directory), JSON.stringify({ width: 10, height: 10 }));
    expect(loadWindowState(directory)).toBeNull();
  });

  it('по умолчанию окно не меньше проверочного размера 900×640', () => {
    expect(DEFAULT_WINDOW_SIZE.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(DEFAULT_WINDOW_SIZE.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
  });
});

describe('windowStateFromBounds', () => {
  it('сохраняет нормальные границы развёрнутого окна', () => {
    expect(windowStateFromBounds({ x: 40.2, y: 30.8, width: 1180.4, height: 760.2 }, true)).toEqual(
      { x: 40, y: 31, width: 1180, height: 760, isMaximized: true },
    );
  });
});
