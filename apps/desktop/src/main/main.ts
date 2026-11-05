import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerPing } from './ipc/ping.js';

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

void app.whenReady().then(() => {
  registerPing();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
