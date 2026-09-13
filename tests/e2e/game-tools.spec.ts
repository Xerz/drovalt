import { expect, test, type Page } from '@playwright/test';
import type { GameDetail } from '../../lib/drova/types';

const OLD = String.raw`C:\Program Files (x86)\EasyAntiCheat`;
const NEW = String.raw`C:\Program Files (x86)\EasyAntiCheat_EOS`;
function game(
  productId: string,
  overrides: Partial<GameDetail> = {},
): GameDetail {
  return {
    productId,
    title: `Test ${productId}`,
    published: true,
    enabled: false,
    verified: 2,
    available: true,
    gamePath: null,
    workPath: null,
    allowedPaths: null,
    args: null,
    defaultGamePath: '',
    defaultWorkPath: '',
    defaultAllowedPaths: OLD,
    defaultArgs: '',
    ...overrides,
  };
}

async function setup(page: Page, initial: GameDetail[] = []) {
  const catalog = [
    ...initial,
    ...Array.from({ length: 16 }, (_, index) =>
      game(`new-${String(index).padStart(2, '0')}`),
    ),
  ];
  const games = new Map(
    initial.map((item) => [item.productId, structuredClone(item)]),
  );
  const writes: Array<Record<string, unknown>> = [];
  const adds: string[] = [];
  const failReads = new Set<string>();
  const failWrites = new Set<string>();
  await page.addInitScript(() => {
    localStorage.setItem('drovalt.mode.v1', 'live');
    localStorage.setItem('drovalt.merchantToken.v1', 'synthetic-test-only');
  });
  // Every service request is intercepted; no live Drova traffic is permitted.
  await page.route('https://services.drova.io/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ json, status });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/accounting/myaccount')
      return reply({ uuid: 'synthetic-merchant', roles: ['merchant'] });
    if (path === '/product-manager/product/listfull2') return reply(catalog);
    if (path === '/session-manager/sessions') return reply({ sessions: [] });
    if (path === '/server-manager/servers/server_names')
      return reply({ 'synthetic-station': 'Test station' });
    if (path === '/server-manager/servers')
      return reply([
        {
          uuid: 'synthetic-station',
          name: 'Test station',
          published: true,
          allow_desktop: false,
          disable_updates: false,
          product_list: [...games.keys()],
        },
      ]);
    if (path === '/server-manager/serverproduct/list4edit2/synthetic-station')
      return reply([...games.values()]);
    if (
      path.startsWith(
        '/server-manager/serverproduct/list4edit2/synthetic-station/',
      )
    ) {
      const id = path.split('/').at(-1)!;
      return failReads.has(id)
        ? reply({}, 500)
        : reply(games.get(id), games.has(id) ? 200 : 404);
    }
    if (
      path.startsWith('/server-manager/serverproduct/add/synthetic-station/')
    ) {
      const id = path.split('/').at(-1)!;
      adds.push(id);
      games.set(
        id,
        structuredClone(catalog.find((item) => item.productId === id)!),
      );
      return reply({});
    }
    if (path === '/server-manager/serverproduct/update') {
      const update = request.postDataJSON();
      writes.push(update);
      if (failWrites.has(update.product_id)) return reply({}, 500);
      games.set(update.product_id, {
        ...games.get(update.product_id)!,
        enabled: update.enabled,
        gamePath: update.game_path,
        workPath: update.work_path,
        allowedPaths: update.allowed_paths,
        args: update.args,
      });
      return reply({});
    }
    return route.abort();
  });
  await page.goto('/games');
  await expect(page.getByLabel('Выбранная станция')).toHaveValue(
    'synthetic-station',
  );
  return { games, writes, adds, failReads, failWrites };
}

test('added rows survive refresh, search and nested editing, then reset on reopening', async ({
  page,
}) => {
  const state = await setup(page);
  await page
    .getByRole('button', { name: 'Добавить игру', exact: true })
    .click();
  const add = page.getByRole('dialog', { name: 'Добавить игру', exact: true });
  const row = add.getByRole('group', { name: 'Игра Test new-10', exact: true });
  await row.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(
    row.getByRole('button', { name: 'Добавлено', exact: true }),
  ).toBeDisabled();
  const gear = row.getByRole('button', {
    name: 'Настройки игры Test new-10',
    exact: true,
  });
  await expect(gear).toBeEnabled();
  await gear.scrollIntoViewIfNeeded();
  const list = add.locator('.overflow-y-auto');
  const scrollBefore = await list.evaluate((element) => element.scrollTop);
  await gear.click();
  const edit = page.getByRole('dialog', { name: 'Test new-10', exact: true });
  await expect(edit.getByLabel('Разрешённые пути')).toHaveValue('');
  await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(gear).toBeFocused();
  expect(await list.evaluate((element) => element.scrollTop)).toBe(
    scrollBefore,
  );
  await gear.click();
  await edit.getByLabel('Разрешённые пути').fill(NEW);
  await edit.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(gear).toBeFocused();
  await expect(
    row.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  await add.getByPlaceholder('Название игры').fill('new-10');
  await expect(row).toBeVisible();
  await add.getByPlaceholder('Название игры').fill('new-11');
  await expect(row).toHaveCount(0);
  const second = add.getByRole('group', {
    name: 'Игра Test new-11',
    exact: true,
  });
  await second.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(
    second.getByRole('button', { name: 'Добавлено' }),
  ).toBeDisabled();
  await expect(second.getByRole('button', { name: 'Оставить' })).toBeEnabled();
  await second.getByRole('button', { name: 'Оставить' }).click();
  await expect(
    second.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toHaveCount(0);
  await add.getByPlaceholder('Название игры').fill('new-10');
  await add.getByPlaceholder('Название игры').fill('');
  await expect(
    second.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toHaveCount(0);
  await expect(add.getByRole('button', { name: 'Добавлено' })).toHaveCount(2);
  expect(state.adds).toEqual(['new-10', 'new-11']);
  await add.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page
    .getByRole('button', { name: 'Добавить игру', exact: true })
    .click();
  await expect(add.getByRole('button', { name: 'Добавлено' })).toHaveCount(0);
  await add.getByPlaceholder('Название игры').fill('new-10');
  await expect(add.getByText('Подходящих игр нет.')).toBeVisible();
});

test('offers a separate EAC fix after adding and keeps settings accessible', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page);
  await page
    .getByRole('button', { name: 'Добавить игру', exact: true })
    .click();
  const add = page.getByRole('dialog', { name: 'Добавить игру', exact: true });
  const row = add.getByRole('group', { name: 'Игра Test new-00', exact: true });
  await row.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(
    row.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toBeEnabled();
  expect(state.writes).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('add-game-mobile.png') });
  await row
    .getByRole('button', { name: 'Исправить путь', exact: true })
    .click();
  await expect(
    row.getByRole('button', { name: 'Настройки игры Test new-00' }),
  ).toBeEnabled();
  await expect(
    row.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toHaveCount(0);
  expect(state.games.get('new-00')!.allowedPaths).toBe(NEW);
  expect(state.writes).toHaveLength(1);
});

test('station scan ignores page filters, supports selection and reports unread games', async ({
  page,
}) => {
  const state = await setup(page, [
    game('one'),
    game('two', { allowedPaths: OLD, enabled: true }),
    game('broken'),
  ]);
  state.failReads.add('broken');
  await page.getByLabel('Поиск игр', { exact: true }).fill('nothing matches');
  await page
    .getByRole('button', { name: 'Проверить пути EAC', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Проверка путей EAC',
    exact: true,
  });
  await expect(dialog.getByText(/Проверка неполная/)).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: 'Исправить Test one', exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole('checkbox', { name: 'Исправить Test two', exact: true })
    .uncheck();
  await dialog
    .getByRole('button', { name: 'Исправить выбранные (1)', exact: true })
    .click();
  await expect(dialog.getByText(/Исправлено: 1/)).toBeVisible();
  expect(state.games.get('one')!.allowedPaths).toBe(NEW);
  expect(state.games.get('two')!.allowedPaths).toBe(OLD);
  expect(state.writes).toHaveLength(1);
  await dialog
    .getByRole('button', { name: 'Проверить снова', exact: true })
    .click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Исправить Test one', exact: true }),
  ).toBeDisabled();
});

test('station writes stop on failure and require a new scan', async ({
  page,
}) => {
  const state = await setup(page, [game('one'), game('two'), game('three')]);
  state.failWrites.add('two');
  await page
    .getByRole('button', { name: 'Проверить пути EAC', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Проверка путей EAC',
    exact: true,
  });
  await expect(
    dialog.getByRole('button', { name: 'Исправить выбранные (3)' }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Исправить выбранные (3)' }).click();
  await expect(dialog.getByText(/Исправлено: 1.*Ошибок: 1/)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Исправить выбранные (3)' }),
  ).toBeDisabled();
  expect(state.writes.map((item) => item.product_id)).toEqual(['one', 'two']);
  expect(state.games.get('three')!.allowedPaths).toBeNull();
});

test('a changed preview is skipped and a failed inline fix leaves the editor available', async ({
  page,
}) => {
  const state = await setup(page);
  await page
    .getByRole('button', { name: 'Добавить игру', exact: true })
    .click();
  const add = page.getByRole('dialog', { name: 'Добавить игру', exact: true });
  const row = add.getByRole('group', { name: 'Игра Test new-00', exact: true });
  await row.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(
    row.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toBeEnabled();
  state.games.get('new-00')!.allowedPaths = `${OLD};C:\\Another`;
  await row
    .getByRole('button', { name: 'Исправить путь', exact: true })
    .click();
  await expect(
    row.getByText('Пути изменились. Повторите проверку.'),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await row
    .getByRole('button', { name: 'Проверить снова', exact: true })
    .click();
  await expect(
    row.getByRole('button', { name: 'Исправить путь', exact: true }),
  ).toBeEnabled();
  state.failWrites.add('new-00');
  await row
    .getByRole('button', { name: 'Исправить путь', exact: true })
    .click();
  await expect(row.getByText(/Операция остановлена/)).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await row.getByRole('button', { name: 'Настройки игры Test new-00' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Test new-00', exact: true })
      .getByLabel('Разрешённые пути'),
  ).toHaveValue(`${OLD};C:\\Another`);
});
