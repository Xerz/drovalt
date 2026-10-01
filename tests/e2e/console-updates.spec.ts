import { expect, test, type Page, type TestInfo } from '@playwright/test';

import type { MerchantSession, Station } from '../../lib/drova/types';

const storageKey = 'drovalt.hiddenStations.v1';
const review =
  'Полный многострочный отзыв, который не помещается в ячейку таблицы.\nВторая строка с подробностями: <b>обычный текст</b>.\n' +
  'ОченьДлинноеСлово'.repeat(35);

async function openSection(page: Page, info: TestInfo, section: string) {
  const pages = new URL(info.project.use.baseURL!).pathname === '/drovalt/';
  await page.goto(pages ? `./#/${section}` : `/${section}`);
  await expect(page.getByRole('table').first()).toBeVisible({
    timeout: 15_000,
  });
}

async function setup(
  page: Page,
  options: { preferences?: string; denyStorage?: 'read' | 'write' } = {},
) {
  const now = Date.now();
  const stations: Station[] = Array.from({ length: 3 }, (_, index) => ({
    uuid: `synthetic-station-${index}`,
    name: `Станция ${index + 1}`,
    description: '',
    published: true,
    allow_desktop: false,
    disable_updates: false,
    state: index === 2 ? 'OFFLINE' : 'READY',
    last_heartbeat: now,
    product_list: [],
  }));
  const sessions: MerchantSession[] = Array.from({ length: 36 }, (_, index) => {
    const created = now - 86_400_000 - index * 1_800_000;
    return {
      uuid: `synthetic-session-${index}`,
      client_id: `synthetic-client-${index % 3}`,
      creator_ip: `203.0.113.${10 + (index % 2)}`,
      server_id: stations[index % 3].uuid,
      product_id: `synthetic-game-${index % 2}`,
      billing_type: index % 2 ? 'subscription' : 'prepaid',
      created_on: created,
      finished_on: created + [15, 60, 120, 240, 10][index % 5] * 60_000,
      status: 'FINISHED',
      score: 5,
      score_text: index === 0 ? review : `Отзыв ${index}`,
    };
  });
  sessions[35] = {
    ...sessions[35],
    client_id: null,
    creator_ip: null,
    server_id: null,
    product_id: null,
    billing_type: null,
    score_text: null,
  };
  const state = {
    account: 'synthetic-account-a',
    stations,
    sessions,
    writes: [] as string[],
    failSessions: false,
  };
  await page.addInitScript(
    ({ storageKey, preferences, denyStorage }) => {
      localStorage.setItem('drovalt.mode.v1', 'live');
      localStorage.setItem('drovalt.merchantToken.v1', 'synthetic-test-only');
      if (
        preferences !== undefined &&
        localStorage.getItem(storageKey) === null
      )
        localStorage.setItem(storageKey, preferences);
      if (denyStorage === 'write') {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === storageKey)
            throw new DOMException('Storage unavailable', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      }
      if (denyStorage === 'read') {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          if (key === storageKey)
            throw new DOMException('Storage unavailable', 'SecurityError');
          return original.call(this, key);
        };
      }
    },
    { storageKey, ...options },
  );
  await page.route(
    'https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/**',
    (route) => route.abort(),
  );
  // Only synthetic responses are used. Unexpected requests are aborted.
  await page.route('https://services.drova.io/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ json, status });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/accounting/myaccount')
      return reply({ uuid: state.account, roles: ['merchant'] });
    if (path === '/product-manager/product/listfull2')
      return reply(
        [0, 1].map((index) => ({
          productId: `synthetic-game-${index}`,
          title: `Игра ${index + 1}`,
        })),
      );
    if (path === '/server-manager/servers') return reply(state.stations);
    if (path === '/session-manager/sessions') {
      if (state.failSessions) return reply({}, 500);
      const serverId = url.searchParams.get('server_id');
      const rows = serverId
        ? state.sessions.filter((session) => session.server_id === serverId)
        : state.sessions;
      return reply({
        sessions: rows.slice(0, Number(url.searchParams.get('limit') ?? 1000)),
      });
    }
    if (path.startsWith('/server-manager/serverproduct/list4edit2/'))
      return reply([]);
    const flagMatch = path.match(
      /^\/server-manager\/servers\/(synthetic-station-\d)\/set_(published|allow_desktop|disable_updates)\/(true|false)$/,
    );
    if (flagMatch && request.method() === 'POST') {
      state.writes.push(path);
      const station = state.stations.find(
        (station) => station.uuid === flagMatch[1],
      )!;
      station[
        flagMatch[2] as 'published' | 'allow_desktop' | 'disable_updates'
      ] = flagMatch[3] === 'true';
      return reply({});
    }
    if (path.startsWith('/server-manager/servers/synthetic-station-'))
      return reply(
        state.stations.find(
          (station) => station.uuid === path.split('/').at(-1),
        ),
      );
    if (path === '/accounting/statistics/myserverusageprepared') {
      const perServerStats = Object.fromEntries(
        state.stations.map((station, index) => [
          station.uuid,
          {
            totalStat: {
              sessionCount: 10,
              totalMsecs: [3_600_000, 10_800_000, 7_200_000][index],
              totalIncome: [999, 1, 50][index],
            },
            perGameStats: {
              'synthetic-game-0': {
                sessionCount: 10,
                totalMsecs: 3_600_000,
                totalIncome: 999,
              },
            },
          },
        ]),
      );
      const period = {
        totalStat: {
          sessionCount: 30,
          totalMsecs: 21_600_000,
          totalIncome: 1050,
        },
        perServerStats,
        perGameStats: {},
      };
      return reply({ todayStat: period, weekStat: period, monthStat: period });
    }
    if (path.startsWith('/accounting/unpayedstats/'))
      return reply({ trial_msecs_left: 0 });
    if (path === '/accounting/tinkoff/prepaid/getOpenedDeals')
      return reply([{ created_on: now, sum: 100, payout: 80 }]);
    return route.abort();
  });
  return state;
}

test('station controls share a column and preserve flag writes and readback', async ({
  page,
}, info) => {
  const state = await setup(page);
  await openSection(page, info, 'stations');
  await expect(
    page.getByRole('columnheader', { name: 'Управление' }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', {
      name: /^(Публикация|Рабочий стол|Обновления)$/,
    }),
  ).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'Станция 1' });
  const controls = row.getByRole('cell').nth(5);
  await expect(controls.getByRole('switch')).toHaveCount(3);
  const publication = controls.getByRole('switch', {
    name: 'Публикация Станция 1',
  });
  const desktop = controls.getByRole('switch', {
    name: 'Рабочий стол Станция 1',
  });
  const updates = controls.getByRole('switch', {
    name: 'Автообновления Станция 1',
  });
  const boxes = await Promise.all([
    publication.boundingBox(),
    desktop.boundingBox(),
    updates.boundingBox(),
  ]);
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  await publication.click();
  await expect(publication).not.toBeChecked();
  await expect(desktop).toBeEnabled();
  await desktop.click();
  await expect(desktop).toBeChecked();
  await expect(updates).toBeEnabled();
  await updates.click();
  await expect(updates).not.toBeChecked();
  expect(state.writes).toHaveLength(3);
  expect(state.stations[0]).toMatchObject({
    published: false,
    allow_desktop: true,
    disable_updates: true,
  });
});

test('station activity displays utilization, long average and new buckets', async ({
  page,
}, info) => {
  const state = await setup(page);
  await openSection(page, info, 'stations');
  const trigger = page
    .getByRole('row')
    .filter({ hasText: 'Станция 1' })
    .getByRole('button', { name: /Длинные сессии станции/ });
  const stationSessions = state.sessions.filter(
    (session) => session.server_id === 'synthetic-station-0',
  );
  const durations = stationSessions.map(
    (session) => session.finished_on! - session.created_on,
  );
  const long = durations.filter((duration) => duration >= 900_000);
  const share = new Intl.NumberFormat('ru-RU', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(long.length / durations.length);
  const utilization = new Intl.NumberFormat('ru-RU', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(
    durations.reduce((sum, value) => sum + value, 0) / (720 * 3_600_000),
  );
  await expect(trigger).toHaveText(`${share}${utilization}`);
  await trigger.hover();
  const popup = page.getByRole('dialog', {
    name: 'Активность станции Станция 1',
    exact: true,
  });
  await expect(
    popup.getByText(`${utilization} утилизации`, { exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByText('Средняя 15+ мин', { exact: true }),
  ).toBeVisible();
  await expect(popup.getByText('Средняя', { exact: true })).toBeVisible();
  for (const label of ['до 15 м', '15–60 м', '1–2 ч', '2–4 ч', '4+ ч'])
    await expect(popup.getByText(label, { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('station-activity.png'),
    animations: 'disabled',
  });
});

test('station activity preserves empty-history and error states', async ({
  page,
}, info) => {
  const state = await setup(page);
  state.sessions = [];
  await openSection(page, info, 'stations');
  const trigger = page
    .getByRole('row')
    .filter({ hasText: 'Станция 1' })
    .getByRole('button', { name: /Длинные сессии станции/ });
  await expect(trigger).toHaveText('——');
  await trigger.click();
  await expect(
    page.getByText(
      'В загруженной истории за последние 30 дней завершённых сессий нет.',
    ),
  ).toBeVisible();
  state.failSessions = true;
  await page.reload();
  await expect(trigger).toHaveText('——');
  await trigger.click();
  await expect(
    page.getByText('Не удалось загрузить историю сессий.'),
  ).toBeVisible();
});

test('hidden stations persist and can be restored without affecting other pages', async ({
  page,
}, info) => {
  const state = await setup(page);
  await openSection(page, info, 'stations');
  await expect(
    page.getByText('2 из 3 станций в сети', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Скрыть станцию Станция 1', exact: true })
    .click();
  await expect(
    page.getByText('1 из 2 станций в сети', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'Станция 1' }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByText('1 из 2 станций в сети', { exact: true }),
  ).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Меню мерчанта' });
  await navigation.getByRole('button', { name: 'Игры', exact: true }).click();
  await expect(
    page
      .getByLabel('Выбранная станция')
      .locator('option', { hasText: 'Станция 1' }),
  ).toHaveCount(1);
  await navigation
    .getByRole('button', { name: 'Статистика', exact: true })
    .click();
  await expect(
    page
      .getByRole('table')
      .first()
      .getByRole('row')
      .filter({ hasText: 'Станция 1' }),
  ).toHaveCount(1);
  await navigation
    .getByRole('button', { name: 'Станции', exact: true })
    .click();
  await page.getByRole('button', { name: 'Скрытые (1)', exact: true }).click();
  await page
    .getByRole('button', { name: 'Вернуть станцию Станция 1', exact: true })
    .click();
  await expect(
    page.getByText('2 из 3 станций в сети', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Скрытые (1)', exact: true }),
  ).toHaveCount(0);
});

test('all stations can be hidden while the restore list remains accessible', async ({
  page,
}, info) => {
  await setup(page);
  await openSection(page, info, 'stations');
  for (const index of [1, 2, 3])
    await page
      .getByRole('button', {
        name: `Скрыть станцию Станция ${index}`,
        exact: true,
      })
      .click();
  await expect(
    page.getByText('0 из 0 станций в сети', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Все станции скрыты' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Скрытые (3)', exact: true }).click();
  await page
    .getByRole('button', { name: 'Вернуть станцию Станция 2', exact: true })
    .click();
  await expect(
    page.getByText('1 из 1 станций в сети', { exact: true }),
  ).toBeVisible();
});

test('hidden preferences are isolated across accounts and demo/live mode', async ({
  page,
}, info) => {
  const state = await setup(page, {
    preferences: JSON.stringify({
      'demo:synthetic-account-a': ['synthetic-station-1'],
    }),
  });
  await openSection(page, info, 'stations');
  await expect(
    page.getByText('2 из 3 станций в сети', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Скрыть станцию Станция 1', exact: true })
    .click();
  state.account = 'synthetic-account-b';
  await page.reload();
  await expect(
    page.getByText('2 из 3 станций в сети', { exact: true }),
  ).toBeVisible();
  state.account = 'synthetic-account-a';
  await page.reload();
  await expect(
    page.getByText('1 из 2 станций в сети', { exact: true }),
  ).toBeVisible();
  const preferences = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  );
  expect(preferences['demo:synthetic-account-a']).toEqual([
    'synthetic-station-1',
  ]);
});

test('corrupt hidden preferences do not prevent rendering or subsequent saving', async ({
  page,
}, info) => {
  await setup(page, { preferences: '{"live:synthetic-account-a":[42]}' });
  await openSection(page, info, 'stations');
  await expect(
    page.getByText('2 из 3 станций в сети', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Скрыть станцию Станция 1', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText('1 из 2 станций в сети', { exact: true }),
  ).toBeVisible();
});

for (const denyStorage of ['read', 'write'] as const) {
  test(`unavailable storage (${denyStorage}) retains hiding in memory across navigation`, async ({
    page,
  }, info) => {
    await setup(page, { denyStorage });
    await openSection(page, info, 'stations');
    await page
      .getByRole('button', { name: 'Скрыть станцию Станция 1', exact: true })
      .click();
    await expect(
      page.getByText(/Скрытие действует до перезагрузки страницы/),
    ).toBeVisible();
    await expect(
      page.getByText('1 из 2 станций в сети', { exact: true }),
    ).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Меню мерчанта' });
    await navigation
      .getByRole('button', { name: 'Сессии', exact: true })
      .click();
    await navigation
      .getByRole('button', { name: 'Станции', exact: true })
      .click();
    await expect(
      page.getByText('1 из 2 станций в сети', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Скрытые (1)', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Вернуть станцию Станция 1', exact: true })
      .click();
    await expect(
      page.getByText('2 из 3 станций в сети', { exact: true }),
    ).toBeVisible();
  });
}

test('statistics remove usage income and order stations by time while retaining payouts', async ({
  page,
}, info) => {
  await setup(page);
  await openSection(page, info, 'statistics');
  const table = page.getByRole('table').first();
  await expect(table.getByRole('columnheader')).toHaveCount(3);
  await expect(page.getByText('Доход', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Доход по станциям', { exact: true }),
  ).toHaveCount(0);
  const rows = table.locator('tbody').getByRole('row');
  await expect(rows.nth(0)).toContainText('Станция 2');
  await expect(rows.nth(1)).toContainText('Станция 3');
  await expect(rows.nth(2)).toContainText('Станция 1');
  await rows.nth(0).click();
  await expect(table.locator('td[colspan="3"]')).toContainText('10 сессий');
  await expect(table).not.toContainText('₽');
  await expect(
    page.getByText('Сумма открытых выплат', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('К выплате после комиссий', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('statistics.png'),
    animations: 'disabled',
  });
});

const filterCases = [
  { label: 'Client ID', broad: 'synthetic-client-' },
  { label: 'IP', broad: '203.0.113.' },
  { label: 'Игра', broad: 'Игра' },
  { label: 'Станция', broad: 'Станция' },
  { label: 'Billing', broad: 'p' },
];
for (const { label, broad } of filterCases) {
  test(`clicking ${label} replaces its filter, preserves other filters and resets pagination`, async ({
    page,
  }, info) => {
    await setup(page);
    await openSection(page, info, 'sessions');
    await page.getByLabel(`Фильтр: ${label}`, { exact: true }).fill(broad);
    const otherLabel = label === 'IP' ? 'Client ID' : 'IP';
    const otherValue = otherLabel === 'IP' ? '203.0.113.' : 'synthetic-client-';
    await page
      .getByLabel(`Фильтр: ${otherLabel}`, { exact: true })
      .fill(otherValue);
    await page.getByRole('button', { name: 'Вперёд', exact: true }).click();
    await expect(page.getByText(/Страница 2 из/)).toBeVisible();
    const button = page
      .getByRole('button', { name: new RegExp(`^Фильтровать ${label}:`) })
      .first();
    const fullValue = await button.textContent();
    await button.click();
    await expect(
      page.getByLabel(`Фильтр: ${label}`, { exact: true }),
    ).toHaveValue(fullValue!);
    await expect(
      page.getByLabel(`Фильтр: ${otherLabel}`, { exact: true }),
    ).toHaveValue(otherValue);
    await expect(page.getByText(/Страница 1 из/)).toBeVisible();
  });
}

test('empty session values remain non-interactive', async ({ page }, info) => {
  await setup(page);
  await openSection(page, info, 'sessions');
  await page.getByRole('button', { name: 'Вперёд', exact: true }).click();
  const row = page.getByRole('table').locator('tbody tr').last();
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(row.getByRole('cell').first()).toHaveText('—');
});

test('review popup preserves full text and keyboard access and updates CSV and column labels', async ({
  page,
}, info) => {
  await setup(page);
  await openSection(page, info, 'sessions');
  await expect(
    page.getByRole('columnheader', { name: 'Отзыв', exact: true }),
  ).toBeVisible();
  const trigger = page
    .getByRole('button', { name: 'Показать полный отзыв', exact: true })
    .first();
  const popup = page.getByRole('dialog', { name: 'Полный отзыв', exact: true });
  await trigger.hover();
  await expect(popup.locator('p').last()).toHaveText(review);
  expect(await popup.locator('p').last().textContent()).toBe(review);
  await page.mouse.move(8, 8);
  await expect(popup).not.toBeVisible();
  await trigger.focus();
  await trigger.press('Enter');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Колонки', exact: true }).click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Отзыв', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8').split('\r\n')[0]).toContain(
    'Отзыв',
  );
});

test.describe('mobile details', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 640 },
  });
  test('full review opens by tap, wraps long words and remains inside the viewport', async ({
    page,
  }, info) => {
    await setup(page);
    await openSection(page, info, 'sessions');
    const trigger = page
      .getByRole('button', { name: 'Показать полный отзыв', exact: true })
      .first();
    const popup = page.getByRole('dialog', {
      name: 'Полный отзыв',
      exact: true,
    });
    await trigger.tap();
    await expect(popup).toBeVisible();
    await expect(popup.locator('p').last()).toHaveText(review);
    await expect(popup).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: info.outputPath('review-mobile.png'),
      animations: 'disabled',
    });
    const dimensions = await popup.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
    await page.touchscreen.tap(8, 8);
    await expect(popup).not.toBeVisible();
  });
});
