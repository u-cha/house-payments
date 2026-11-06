import { app, ipcMain } from 'electron';
import { APP_QUIT_CHANNEL } from '../../shared/ipc.js';

/**
 * «Выйти» завершает приложение целиком (ADR-0006: сессия живёт в памяти
 * процесса), а не оставляет окно и иконку в доке. `app.quit()` закрывает
 * окна, вызывает `will-quit` и корректно закрывает файл данных.
 */
export function registerApp(): void {
  ipcMain.on(APP_QUIT_CHANNEL, () => app.quit());
}
