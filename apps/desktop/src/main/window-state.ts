import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Состояние окна (desktop-ui-electron, ADR-0020): размер, позиция и
 * развёрнутость переживают перезапуск. Файл живёт рядом с файлом данных в
 * `userData`; восстановление проверяется по текущим дисплеям, чтобы окно не
 * открылось за пределами экрана после смены монитора.
 *
 * Модуль не импортирует Electron: чистые функции тестируются без окна.
 */

export const WINDOW_STATE_FILE = 'window-state.json';

export const DEFAULT_WINDOW_WIDTH = 1180;
export const DEFAULT_WINDOW_HEIGHT = 760;
export const MIN_WINDOW_WIDTH = 900;
export const MIN_WINDOW_HEIGHT = 640;

/** Минимальная видимая часть окна, чтобы восстановленная позиция считалась рабочей. */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 64;

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowState extends WindowSize {
  x: number;
  y: number;
  isMaximized: boolean;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_SIZE: WindowSize = {
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Приводит произвольный JSON к состоянию окна; мусор и старые форматы — null. */
export function sanitizeWindowState(value: unknown): WindowState | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const { x, y, width, height } = candidate;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) return null;
  if (width > 20_000 || height > 20_000) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    isMaximized: candidate['isMaximized'] === true,
  };
}

/**
 * Пересекается ли окно с рабочей областью хотя бы одного дисплея настолько,
 * чтобы за него можно было взяться мышью.
 */
export function isWindowStateVisible(state: WindowState, displays: DisplayWorkArea[]): boolean {
  if (displays.length === 0) return true;
  return displays.some((area) => {
    const overlapWidth =
      Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x);
    const overlapHeight =
      Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y);
    return overlapWidth >= MIN_VISIBLE_WIDTH && overlapHeight >= MIN_VISIBLE_HEIGHT;
  });
}

export function windowStatePath(userDataPath: string): string {
  return path.join(userDataPath, WINDOW_STATE_FILE);
}

/** Читает состояние; битый или чужой файл не мешает запуску. */
export function loadWindowState(userDataPath: string): WindowState | null {
  try {
    const raw = readFileSync(windowStatePath(userDataPath), 'utf8');
    return sanitizeWindowState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Пишет состояние атомарно для одного процесса; ошибка записи не роняет приложение. */
export function saveWindowState(userDataPath: string, state: WindowState): void {
  try {
    writeFileSync(windowStatePath(userDataPath), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // Окно важнее файла состояния: при ошибке просто откроется по умолчанию.
  }
}

/** Границы окна в состояние: у развёрнутого окна сохраняются нормальные границы. */
export function windowStateFromBounds(
  bounds: { x: number; y: number; width: number; height: number },
  isMaximized: boolean,
): WindowState {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    isMaximized,
  };
}
