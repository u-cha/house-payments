import { app, ipcMain } from 'electron';
import { z } from 'zod';
import { PING_CHANNEL, type PingResult } from '../../shared/ipc.js';

// Минимальная Zod-валидация на границе IPC: ping не принимает аргументов.
const pingRequestSchema = z.tuple([]);

export function registerPing(): void {
  ipcMain.handle(PING_CHANNEL, (_event, ...args): PingResult => {
    pingRequestSchema.parse(args);
    return { ok: true, version: app.getVersion() };
  });
}
