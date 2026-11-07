import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

// Smoke E2E (ADR-0010) запускает настоящее Electron-приложение с отдельным
// файлом данных. Нужен собранный dist/: скрипт `test:e2e` делает `pnpm build`.
const APP = path.resolve(import.meta.dirname, '../..');

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  close(): Promise<void>;
}

export async function launchApp(): Promise<LaunchedApp> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'house-payments-e2e-'));
  const env = { ...process.env, HOUSE_PAYMENTS_USER_DATA: dataDir, HOUSE_PAYMENTS_E2E: '1' };
  // DSH сам запущен в Electron: иначе дочерний процесс стартует как Node.
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: APP,
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    dataDir,
    async close() {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Первый запуск и вход: после него приложение показывает рабочий Shell. */
export async function firstRunAndLogin(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'Первый запуск' }).waitFor();
  await page.getByLabel('Имя профиля').fill('Владелец');
  await page.getByLabel('Пароль', { exact: true }).fill('password123');
  await page.getByLabel('Повторите пароль').fill('password123');
  await page.getByRole('button', { name: 'Создать профиль' }).click();

  await page.getByRole('heading', { name: 'Вход' }).waitFor();
  await page.getByLabel('Пароль').fill('password123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Объекты' }).waitFor();
}
