import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
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

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    title: 'house-payments',
    webPreferences: {
      // Изоляция renderer: Node-API в окне нет, мост — только через preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.on('close', (event) => {
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
