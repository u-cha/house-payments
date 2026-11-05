import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDataFile, type AppDatabase } from './infrastructure/db/index.js';
import { registerPing } from './ipc/ping.js';
import { AppError } from './shared/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// main собирается в dist/node/main, preload — в dist/node/preload/preload.cjs.
const preloadPath = path.join(currentDir, '../preload/preload.cjs');

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

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(currentDir, '../../renderer/index.html'));
  }
}

let database: AppDatabase | undefined;

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
  registerPing();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => database?.close());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
