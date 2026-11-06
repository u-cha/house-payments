/**
 * Подтверждение выхода (как в iTerm2): и красный крест окна, и кнопка «Выйти»
 * спрашивают «Выйти?», и только после ответа «Выйти» приложение завершается.
 * Показывать диалог и завершать процесс — зависимости контроллера, поэтому
 * порядок подтверждения проверяется тестом без Electron.
 */
export interface QuitController {
  /** Процесс уже завершается: повторные close/before-quit не переспрашивают. */
  readonly quitting: boolean;
  /** Открывает диалог один раз; при отказе приложение продолжает работу. */
  request(): Promise<void>;
}

export interface QuitControllerOptions {
  confirm(): Promise<boolean>;
  quit(): void;
}

export function createQuitController({ confirm, quit }: QuitControllerOptions): QuitController {
  let quitting = false;
  let prompting = false;

  return {
    get quitting() {
      return quitting;
    },
    async request() {
      if (quitting || prompting) return;
      prompting = true;
      try {
        if (!(await confirm())) return;
        quitting = true;
        quit();
      } finally {
        prompting = false;
      }
    },
  };
}
