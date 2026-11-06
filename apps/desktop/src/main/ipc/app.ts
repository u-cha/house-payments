import { ipcMain } from 'electron';
import { APP_QUIT_CHANNEL } from '../../shared/ipc.js';

/**
 * «Выйти» в UI идёт в тот же контроллер, что и красный крест окна: сначала
 * подтверждение, потом app.quit(). Так приложение не остаётся в доке и не
 * закрывается без согласия пользователя.
 */
export function registerApp(requestQuit: () => void): void {
  ipcMain.on(APP_QUIT_CHANNEL, () => requestQuit());
}
