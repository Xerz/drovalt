import { expect, test } from '@playwright/test';

for (const keyboard of [false, true]) {
  test(`station game count selects its station without reloading (${keyboard ? 'keyboard' : 'mouse'})`, async ({
    page,
  }, testInfo) => {
    const pages =
      new URL(testInfo.project.use.baseURL!).pathname === '/drovalt/';
    await page.route('https://services.drova.io/**', (route) => route.abort());
    await page.goto(pages ? './#/stations' : '/stations');
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const openGames = page.getByRole('button', {
      name: /Открыть .* игр станции Орбита/,
    });
    await expect(openGames).toBeVisible();
    if (keyboard) {
      await openGames.focus();
      await openGames.press('Enter');
    } else await openGames.click();
    await expect(page.getByLabel('Выбранная станция')).toHaveValue(
      'demo-station-02',
    );
    await expect(
      page.getByRole('heading', { name: 'Игры', exact: true }),
    ).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe(pages ? '/drovalt/' : '/games');
    expect(url.search).toBe('');
    expect(url.hash).toBe(pages ? '#/games' : '');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);

    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Станции', exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByLabel('Выбранная станция')).toHaveValue(
      'demo-station-02',
    );
    await page.goBack();
    await page
      .getByRole('button', { name: /Открыть .* игр станции Резервная/ })
      .click();
    await expect(page.getByLabel('Выбранная станция')).toHaveValue(
      'demo-station-03',
    );
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  });
}

test('manual station selection survives switching sections through the menu', async ({
  page,
}, testInfo) => {
  const pages = new URL(testInfo.project.use.baseURL!).pathname === '/drovalt/';
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://services.drova.io/**', (route) => route.abort());
  await page.goto(pages ? './#/games' : '/games');
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const station = page.getByLabel('Выбранная станция');
  await expect(station).toHaveValue('demo-station-01');
  await station.selectOption('demo-station-03');
  const menu = page.getByRole('navigation', { name: 'Меню мерчанта' });
  await menu.getByRole('button', { name: 'Станции', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Станции', exact: true }),
  ).toBeVisible();
  await menu.getByRole('button', { name: 'Игры', exact: true }).click();
  await expect(station).toHaveValue('demo-station-03');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(new URL(page.url()).search).toBe('');
});
