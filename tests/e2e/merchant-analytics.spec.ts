import { expect, test } from '@playwright/test';

test('stations show handshake as occupied and shorten the latest client id', async ({
  page,
}) => {
  await page.goto('/stations');
  const station = page
    .getByRole('row')
    .filter({ hasText: 'Орбита · RTX 4070 Ti' });
  await expect(station.getByText('Используется')).toBeVisible();
  await expect(station.getByText('Клиент …nt-007')).toBeVisible();
});

test('stations show the long-session share and a 30-day duration summary', async ({ page }) => {
  await page.goto('/stations');
  await expect(page.getByRole('columnheader', { name: /Длинные сессии/ })).toBeVisible();
  const station = page.getByRole('row').filter({ hasText: 'Орбита · RTX 4070 Ti' });
  const share = station.getByRole('button', { name: /Длинные сессии станции/ });
  // Every completed demo session lasts at least 18 minutes; the active one
  // must not lower the share or appear in the duration distribution.
  await expect(share).toHaveText(/100\s*%/);
  await share.hover();
  await expect(page.getByText('Активность станции', { exact: true })).toBeVisible();
  await expect(page.getByText(/Больше 15 минут:/)).toBeVisible();
  await expect(page.getByText('Завершённые сессии, начавшиеся за последние 30 дней.')).toBeVisible();
  await expect(page.getByRole('figure').filter({ hasText: 'Гистограмма длительности сессий станции' })).toBeVisible();
  await expect(page.getByText('По загруженной истории сессий. Активные сессии не учитываются.')).toBeVisible();
});

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
  await expect(page.getByText('Сумма открытых выплат')).toBeVisible();
  await expect(page.getByText('К выплате после комиссий')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Исходный код и self-hosting' }),
  ).toHaveAttribute('href', 'https://github.com/Xerz/drovalt');
});

test('sessions table supports filters, detailed fields and manual history load', async ({
  page,
}) => {
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { name: 'Сессии' })).toBeVisible();
  await expect(page.getByText('История сессий')).toBeVisible();
  await page.getByRole('button', { name: 'Колонки' }).click();
  await expect(page.getByText('Видимость колонок')).toBeVisible();
  await page.getByRole('menuitemcheckbox', { name: 'IP' }).click();
  await expect(page.getByRole('columnheader', { name: 'IP' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Все поля' }).click();
  await expect(page.getByRole('columnheader', { name: 'UUID', exact: true })).toBeVisible();
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
