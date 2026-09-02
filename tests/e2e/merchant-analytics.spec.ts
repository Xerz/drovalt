import { expect, test } from '@playwright/test';

test('personal statistics stays on the merchant summary page', async ({
  page,
}) => {
  await page.goto('/statistics');
  await expect(
    page.getByRole('heading', { name: 'Статистика', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Как используются ваши станции' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '6 месяцев · недели' }).click();
  await page.getByRole('button', { name: 'Короткие сессии' }).click();
  await expect(page.getByText(/завершённых сессий/)).toBeVisible();
  await expect(page.getByText('Топ-10 игроков', { exact: true })).toBeVisible();
  await expect(page.getByText('Топ-10 игр', { exact: true })).toBeVisible();
});

test('sessions table supports filters, detailed fields and manual history load', async ({
  page,
}) => {
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { name: 'Сессии' })).toBeVisible();
  await expect(page.getByText('История сессий')).toBeVisible();
  await page.getByRole('button', { name: 'Все поля' }).click();
  await expect(page.getByText('UUID', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '7 дней' }).click();
  await page.getByRole('button', { name: 'Загрузить ещё' }).click();
  await expect(
    page.getByText(/Загрузка (истории по станциям|завершена)/),
  ).toBeVisible();
  await expect(page.getByLabel('Включить тёмную тему')).toBeVisible();
  await page.getByLabel('Включить тёмную тему').click();
  await expect(page.getByLabel('Включить светлую тему')).toBeVisible();
});

test('sessions remain usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { name: 'Сессии' })).toBeVisible();
  await expect(page.getByLabel('Открыть меню')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});
