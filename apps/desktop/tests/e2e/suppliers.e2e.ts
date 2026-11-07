import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstRunAndLogin, launchApp, type LaunchedApp } from './app';

// S-06: реестр поставщиков, предупреждение о дубле, архив и возврат.
let launched: LaunchedApp;

beforeAll(async () => {
  launched = await launchApp();
  await firstRunAndLogin(launched.page);
}, 120_000);

afterAll(async () => {
  await launched?.close();
});

describe('S-06: поставщики', () => {
  it('создание, дубль, фильтр, архив и возврат', async () => {
    const { page } = launched;
    await page.getByRole('button', { name: 'Поставщики' }).click();
    await page.getByRole('heading', { name: 'Поставщики' }).waitFor();
    await page.getByRole('heading', { name: 'Пока нет поставщиков' }).waitFor();

    await page.locator('[data-add-supplier]').click();
    await page.getByLabel('Название').fill('УК Карабайка');
    await page.getByLabel('Тип поставщика').click();
    await page.getByRole('option', { name: 'ТСЖ' }).click();
    await page.getByLabel('Контакты').fill('+7 900 000-00-00');
    await page.getByRole('button', { name: 'Создать поставщика' }).click();

    const row = page.getByRole('button', { name: /УК Карабайка, ТСЖ/ });
    await row.waitFor();
    expect(await row.isVisible()).toBe(true);

    // Дубли разрешены: совпадение — предупреждение, сохранение не блокируется.
    await page.locator('[data-add-supplier]').click();
    await page.getByLabel('Название').fill('ук карабайка ');
    await page.getByText('Поставщик с таким названием уже есть').waitFor();
    await page.getByRole('button', { name: 'Отмена' }).click();
    await page.getByRole('button', { name: 'Продолжить редактирование' }).click();
    await page.getByRole('button', { name: 'Отмена' }).click();
    await page.getByRole('button', { name: 'Выйти без сохранения' }).click();
    await page.getByRole('heading', { name: 'Поставщики' }).waitFor();
    expect(await page.getByRole('button', { name: /УК Карабайка/ }).count()).toBe(1);

    // Поиск фильтрует список на стороне main.
    await page.getByLabel('Поиск по поставщикам').fill('карабайка');
    await row.waitFor();
    await page.getByLabel('Поиск по поставщикам').fill('нет такого');
    await page.getByRole('heading', { name: 'Ничего не найдено' }).waitFor();
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await row.waitFor();

    // Архив скрывает запись; переключатель показывает её с пометкой.
    await row.click();
    await page.getByRole('button', { name: 'В архив' }).click();
    await page.locator('.inline-confirm .btn.danger').click();
    await page.getByRole('heading', { name: 'Пока нет поставщиков' }).waitFor();

    await page.getByLabel('Показать архивные').check();
    const archivedRow = page.getByRole('button', { name: /УК Карабайка, ТСЖ.*в архиве/ });
    await archivedRow.waitFor();
    await archivedRow.click();
    await page.getByRole('button', { name: 'Вернуть в активные' }).click();
    await page.getByRole('heading', { name: 'Поставщики' }).waitFor();
    await row.waitFor();
  }, 120_000);
});
