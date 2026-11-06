import { app, BrowserWindow, dialog, nativeTheme, screen, type MessageBoxOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEventRecorder, openDataFile, type AppDatabase } from './infrastructure/db/index.js';
import { registerApp } from './ipc/app.js';
import { registerAuth } from './ipc/auth.js';
import { registerCatalog } from './ipc/catalog.js';
import { registerPing } from './ipc/ping.js';
import { createQuitController } from './lifecycle.js';
import { InMemorySessionStore } from './modules/identity/index.js';
import { AppError } from './shared/index.js';
import { systemClock } from './shared/clock.js';
import { uuidv7 } from './shared/ids.js';
import {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  isWindowStateVisible,
  loadWindowState,
  saveWindowState,
  windowStateFromBounds,
  type WindowState,
} from './window-state.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// main собирается в dist/node/main, preload — в dist/node/preload/preload.cjs.
const preloadPath = path.join(currentDir, '../preload/preload.cjs');

/**
 * Один сценарий выхода для красного креста, Cmd+Q и кнопки «Выйти»: диалог
 * подтверждения, затем app.quit(). Отмена оставляет окно и приложение живыми.
 */
const quit = createQuitController({
  confirm: async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options: MessageBoxOptions = {
      type: 'question',
      buttons: ['Выйти', 'Отмена'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      message: 'Выйти из house-payments?',
      detail: 'Данные сохраняются автоматически. При следующем запуске снова потребуется пароль.',
    };
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    return response === 0;
  },
  quit: () => app.quit(),
});

const TITLE_BAR_HEIGHT = 38;
const WINDOW_STATE_SAVE_DELAY_MS = 300;

/** Цвета окна следуют системной теме: без них при старте мелькает белая рамка. */
function windowColors(): { background: string; overlay: string; symbol: string } {
  return nativeTheme.shouldUseDarkColors
    ? { background: '#10171A', overlay: '#10171A', symbol: '#E2E9EC' }
    : { background: '#EEF1F2', overlay: '#FFFFFF', symbol: '#16202A' };
}

/** Восстановленное окно принимается только на видимом дисплее (ADR-0020). */
function restoredWindowState(): WindowState | null {
  const state = loadWindowState(app.getPath('userData'));
  if (state === null) return null;
  const displays = screen.getAllDisplays().map((display) => display.workArea);
  return isWindowStateVisible(state, displays) ? state : null;
}

function createWindow(): void {
  const saved = restoredWindowState();
  const colors = windowColors();
  const window = new BrowserWindow({
    width: saved?.width ?? DEFAULT_WINDOW_SIZE.width,
    height: saved?.height ?? DEFAULT_WINDOW_SIZE.height,
    ...(saved === null ? {} : { x: saved.x, y: saved.y }),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    title: 'house-payments',
    backgroundColor: colors.background,
    // Кастомный заголовок окна (desktop-ui-electron, ADR-0020): светофор
    // остаётся системным, drag-регион задаётся в renderer.
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 13 },
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarOverlay: {
            color: colors.overlay,
            symbolColor: colors.symbol,
            height: TITLE_BAR_HEIGHT,
          },
        }),
    webPreferences: {
      // Изоляция renderer: Node-API в окне нет, мост — только через preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  const statePath = app.getPath('userData');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const persistWindowState = (): void => {
    if (window.isDestroyed()) return;
    const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
    saveWindowState(statePath, windowStateFromBounds(bounds, window.isMaximized()));
  };

  const scheduleStateSave = (): void => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistWindowState, WINDOW_STATE_SAVE_DELAY_MS);
  };

  if (saved?.isMaximized === true) window.maximize();

  window.once('ready-to-show', () => window.show());
  window.on('resize', scheduleStateSave);
  window.on('move', scheduleStateSave);

  window.on('close', (event) => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    persistWindowState();
    if (quit.quitting) return;
    event.preventDefault();
    void quit.request();
  });

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(currentDir, '../../renderer/index.html'));
  }
}

let database: AppDatabase | undefined;

/**
 * Идентификатор устройства для `change_log` (ADR-0005): создаётся один раз и
 * живёт в `setting`, чтобы записи одного устройства имели стабильный `device_id`.
 */
function deviceIdFor(db: AppDatabase): string {
  const select = db.prepare("SELECT value FROM setting WHERE key = 'device_id'").pluck();
  const existing = select.get() as string | undefined;
  if (existing !== undefined) return existing;
  db.prepare(
    "INSERT OR IGNORE INTO setting (key, value, updated_at) VALUES ('device_id', ?, ?)",
  ).run(uuidv7(), systemClock.now().toISOString());
  return select.get() as string;
}

void app.whenReady().then(() => {
  // Тема — системная; renderer получает её через prefers-color-scheme, main
  // перекрашивает рамку и оверлей при смене темы ОС (ADR-0020).
  nativeTheme.themeSource = 'system';
  nativeTheme.on('updated', () => {
    const colors = windowColors();
    for (const window of BrowserWindow.getAllWindows()) {
      window.setBackgroundColor(colors.background);
      if (process.platform !== 'darwin') {
        window.setTitleBarOverlay({
          color: colors.overlay,
          symbolColor: colors.symbol,
          height: TITLE_BAR_HEIGHT,
        });
      }
    }
  });

  try {
    // Файл в userData: создаётся при первом запуске, открывается при следующих.
    database = openDataFile(app.getPath('userData'));
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Не удалось открыть файл данных';
    dialog.showErrorBox('house-payments', message);
    app.quit();
    return;
  }
  const recorder = createEventRecorder(database, { deviceId: deviceIdFor(database) });
  const sessions = new InMemorySessionStore(systemClock);
  registerPing();
  registerApp(() => void quit.request());
  registerAuth(database, { recorder }, sessions);
  registerCatalog(database, { recorder }, sessions);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => database?.close());

// Cmd+Q и системный запрос выхода тоже проходят через подтверждение.
app.on('before-quit', (event) => {
  if (quit.quitting) return;
  event.preventDefault();
  void quit.request();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
