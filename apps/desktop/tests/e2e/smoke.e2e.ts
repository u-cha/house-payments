import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Smoke E2E (ADR-0010): настоящее Electron-приложение, отдельный файл данных,
// сценарий первого запуска, входа и создания объекта. Нужен собранный dist/:
// скрипт `test:e2e` делает `pnpm build` перед запуском.
const APP = path.resolve(import.meta.dirname, '../..');
let app: ElectronApplication;
let page: Page;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'house-payments-e2e-'));
  const env = { ...process.env, HOUSE_PAYMENTS_USER_DATA: dataDir, HOUSE_PAYMENTS_E2E: '1' };
  // DSH сам запущен в Electron: иначе дочерний процесс стартует как Node.
  delete env['ELECTRON_RUN_AS_NODE'];
  app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: APP,
    env,
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('smoke: запуск, вход, создание объекта', () => {
  it('первый запуск → вход → объект появляется в реестре', async () => {
    await page.getByRole('heading', { name: 'Первый запуск' }).waitFor();
    await page.getByLabel('Имя профиля').fill('Владелец');
    await page.getByLabel('Пароль', { exact: true }).fill('password123');
    await page.getByLabel('Повторите пароль').fill('password123');
    await page.getByRole('button', { name: 'Создать профиль' }).click();

    await page.getByRole('heading', { name: 'Вход' }).waitFor();
    await page.getByLabel('Пароль').fill('password123');
    await page.getByRole('button', { name: 'Войти' }).click();

    await page.getByRole('button', { name: 'Объекты' }).click();
    await page.getByRole('button', { name: 'Добавить объект' }).click();
    await page.getByLabel('Название').fill('Карабайка 36, кв. 12');
    await page.getByLabel('Адрес').fill('Карабайка, 36');
    await page.getByRole('button', { name: 'Создать объект' }).click();

    const row = page.getByRole('button', { name: /Карабайка 36, кв\. 12/ });
    await row.waitFor();
    expect(await row.isVisible()).toBe(true);
  }, 120_000);
});
