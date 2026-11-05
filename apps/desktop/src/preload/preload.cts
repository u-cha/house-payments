// Sandboxed preload не поддерживает ESM и не грузит локальные модули,
// поэтому файл самодостаточен и собирается в CommonJS (preload.cjs).
import type { HousePaymentsApi } from '../shared/ipc.js';
import electron = require('electron');

const PING_CHANNEL = 'app:ping'; // совпадает с PING_CHANNEL в src/shared/ipc.ts

const api: HousePaymentsApi = {
  ping: () => electron.ipcRenderer.invoke(PING_CHANNEL),
};

electron.contextBridge.exposeInMainWorld('api', api);
