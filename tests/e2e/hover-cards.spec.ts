import { expect, test, type Page, type TestInfo } from '@playwright/test';

const cards = [
  {
    name: 'station sessions',
    section: 'stations',
    trigger: /Длинные сессии станции Орбита/,
    popup: /Активность станции Орбита/,
    content: 'Активность станции',
  },
  {
    name: 'last session player',
    section: 'stations',
    trigger: 'Клиент …nt-007',
    popup: 'Активность игрока …nt-007',
    content: 'Активность игрока',
  },
  {
    name: 'game play time',
    section: 'games',
    trigger: /Активность игры Cyberpunk 2077:/,
    popup: 'Активность игры Cyberpunk 2077',
    content: 'Активность игры',
  },
  {
    name: 'game settings',
    section: 'games',
    trigger: 'Показать пути и параметры запуска для Cyberpunk 2077',
    popup: 'Пути и запуск Cyberpunk 2077',
    content: 'Пути и запуск',
  },
];

async function openSection(page: Page, testInfo: TestInfo, section: string) {
  await page.route('https://services.drova.io/**', (route) => route.abort());
  const pages = new URL(testInfo.project.use.baseURL!).pathname === '/drovalt/';
  await page.goto(pages ? `./#/${section}` : `/${section}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });
}

test.describe('touch cards', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 640 },
  });

  for (const card of cards) {
    test(`${card.name} opens on tap and closes by trigger or outside tap`, async ({
      page,
    }, testInfo) => {
      await openSection(page, testInfo, card.section);
      if (card.name === 'game settings') {
        // Settings are loaded lazily when this horizontally scrollable cell appears.
        await page
          .getByRole('row')
          .filter({ has: page.getByText('Cyberpunk 2077', { exact: true }) })
          .getByRole('cell')
          .nth(4)
          .scrollIntoViewIfNeeded();
      }
      const trigger = page.getByRole('button', {
        name: card.trigger,
        exact: true,
      });
      const popup = page.getByRole('dialog', { name: card.popup, exact: true });
      await expect(trigger).toBeVisible();
      await trigger.tap();
      await expect(popup).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await popup.getByText(card.content, { exact: true }).tap();
      await expect(popup).toBeVisible();
      // Wait for placement and the opening animation to settle before measuring.
      if (card.name === 'game settings') {
        await page.screenshot({
          path: testInfo.outputPath('game-settings-card.png'),
          animations: 'disabled',
        });
      }
      await expect(popup).toBeInViewport({ ratio: 1 });
      const box = await popup.boundingBox();
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      if (card.name === 'station sessions')
        await page.screenshot({ path: testInfo.outputPath('touch-card.png') });
      await trigger.tap();
      await expect(popup).not.toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.tap();
      await expect(popup).toBeVisible();
      await page.touchscreen.tap(8, 8);
      await expect(popup).not.toBeVisible();
    });
  }
});

test('mouse hover and keyboard activation remain available', async ({
  page,
}, testInfo) => {
  for (const card of cards) {
    await openSection(page, testInfo, card.section);
    const trigger = page.getByRole('button', {
      name: card.trigger,
      exact: true,
    });
    const popup = page.getByRole('dialog', { name: card.popup, exact: true });
    await trigger.hover();
    await expect(popup).toBeVisible();
    await popup.hover();
    await expect(popup).toBeVisible();
    await page.mouse.move(8, 8);
    await expect(popup).not.toBeVisible();
    await trigger.focus();
    await trigger.press('Enter');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});
