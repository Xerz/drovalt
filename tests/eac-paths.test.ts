import { describe, expect, it, vi } from 'vitest';
import { createDemoApi } from '@/lib/drova/demo';
import {
  OLD_EAC_PATH as OLD,
  NEW_EAC_PATH as NEW,
  replaceEacPath,
  inspectEacPaths,
  scanEacPaths,
  fixEacPath,
  fixEacPaths,
} from '@/lib/drova/eac-paths';
import type { DrovaApi, GameDetail } from '@/lib/drova/types';

function game(
  productId = 'synthetic-game',
  overrides: Partial<GameDetail> = {},
): GameDetail {
  return {
    productId,
    title: productId,
    published: true,
    defaultGamePath: '',
    defaultWorkPath: '',
    defaultAllowedPaths: OLD,
    defaultArgs: '',
    gamePath: null,
    workPath: null,
    allowedPaths: null,
    args: null,
    enabled: false,
    verified: 2,
    available: true,
    ...overrides,
  };
}

function fakeApi(initial: GameDetail[]) {
  const games = new Map(
    initial.map((item) => [item.productId, structuredClone(item)]),
  );
  return {
    ...createDemoApi(),
    getProducts: vi.fn<DrovaApi['getProducts']>(async () =>
      [...games.values()].map((item) => ({
        ...item,
        useDefaultDesktop: false,
        needVpn: false,
      })),
    ),
    getProduct: vi.fn(async (_station: string, id: string) =>
      structuredClone(games.get(id)!),
    ),
    updateProduct: vi.fn<DrovaApi['updateProduct']>(
      async (_station, update) => {
        games.set(update.productId, {
          ...games.get(update.productId)!,
          ...update,
        });
      },
    ),
    games,
  };
}

describe('EAC path matching', () => {
  it.each([
    null,
    '',
    NEW,
    `${OLD}Extra`,
    `${OLD}\\subfolder`,
    `D:\\${OLD.slice(3)}`,
  ])('leaves unrelated entries intact: %s', (value) => {
    expect(replaceEacPath(value)).toEqual({
      after: value,
      matches: 0,
      ambiguous: false,
    });
  });
  it('preserves separators, quotes, spacing and trailing slash, and is idempotent', () => {
    const value = `  "${OLD.toLowerCase()}\\" ; C:\\Games\\Example\r\n'${OLD}'|${NEW}`;
    const expected = `  "${NEW}\\" ; C:\\Games\\Example\r\n'${NEW}'|${NEW}`;
    expect(replaceEacPath(value)).toEqual({
      after: expected,
      matches: 2,
      ambiguous: false,
    });
    expect(replaceEacPath(expected).matches).toBe(0);
  });
  it.each([`prefix ${OLD}`, `"${OLD}`, `"C:\\Example;${OLD};folder"`])(
    'does not partially rewrite ambiguous input',
    (value) => {
      expect(replaceEacPath(`${OLD};${value}`)).toMatchObject({
        after: `${OLD};${value}`,
        ambiguous: true,
      });
    },
  );
  it('uses custom paths including empty strings and reports unused defaults', () => {
    expect(inspectEacPaths(game())).toMatchObject({
      source: 'default',
      after: NEW,
    });
    expect(
      inspectEacPaths(game('custom', { allowedPaths: `${OLD};C:\\Other` })),
    ).toMatchObject({
      source: 'custom',
      after: `${NEW};C:\\Other`,
      unusedDefault: true,
    });
    expect(inspectEacPaths(game('empty', { allowedPaths: '' }))).toMatchObject({
      before: '',
      after: null,
      unusedDefault: true,
    });
    expect(
      inspectEacPaths(game('correct', { allowedPaths: NEW })),
    ).toMatchObject({ after: null, unusedDefault: true });
  });
});

describe('EAC scan and writes', () => {
  it('scans all games sequentially, retaining individual read failures', async () => {
    const api = fakeApi([
      game('one'),
      game('two'),
      game('three', { enabled: true }),
    ]);
    const read = api.getProduct.getMockImplementation()!;
    let active = 0;
    api.getProduct.mockImplementation(async (station, id) => {
      expect(active++).toBe(0);
      await Promise.resolve();
      active--;
      if (id === 'two') throw new Error('read failed');
      return read(station, id);
    });
    const progress = vi.fn();
    const result = await scanEacPaths(
      api,
      'synthetic-station',
      progress,
      vi.fn(),
    );
    expect(result.total).toBe(3);
    expect(result.findings.map((item) => item.detail.productId)).toEqual([
      'one',
      'three',
    ]);
    expect(result.errors).toEqual([{ productId: 'two', title: 'two' }]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(api.updateProduct).not.toHaveBeenCalled();
  });
  it('updates only allowed paths using fresh values and confirms them by readback', async () => {
    const baseline = game();
    const api = fakeApi([
      game(baseline.productId, {
        args: '-fresh',
        gamePath: 'C:\\Fresh',
        enabled: true,
      }),
    ]);
    const onRead = vi.fn();
    const result = await fixEacPath(
      api,
      'synthetic-station',
      inspectEacPaths(baseline)!,
      onRead,
    );
    expect(result.status).toBe('fixed');
    expect(api.updateProduct).toHaveBeenCalledExactlyOnceWith(
      'synthetic-station',
      {
        productId: baseline.productId,
        verified: 2,
        enabled: true,
        gamePath: 'C:\\Fresh',
        workPath: null,
        args: '-fresh',
        allowedPaths: NEW,
      },
    );
    expect(api.getProduct).toHaveBeenCalledTimes(2);
    expect(onRead).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedPaths: NEW }),
    );
  });
  it.each([
    { allowedPaths: '' },
    { defaultAllowedPaths: `${OLD};C:\\Another` },
    { allowedPaths: NEW },
  ])('skips stale previews: %j', async (change) => {
    const baseline = game();
    const api = fakeApi([game(baseline.productId, change)]);
    expect(
      (
        await fixEacPath(
          api,
          'synthetic-station',
          inspectEacPaths(baseline)!,
          vi.fn(),
        )
      ).status,
    ).toBe('skipped');
    expect(api.updateProduct).not.toHaveBeenCalled();
  });
  it('rejects unsupported verified states before a write', async () => {
    const baseline = game('unsupported', { verified: 7 });
    const api = fakeApi([baseline]);
    await expect(
      fixEacPath(api, 'synthetic-station', inspectEacPaths(baseline)!, vi.fn()),
    ).rejects.toThrow();
    expect(api.updateProduct).not.toHaveBeenCalled();
  });
  it.each(['write', 'readback'])(
    'stops the batch on %s failure without retry, preserving completed results',
    async (failure) => {
      const games = [game('one'), game('two'), game('three')];
      const api = fakeApi(games);
      const write = api.updateProduct.getMockImplementation()!;
      api.updateProduct.mockImplementation(async (station, update) => {
        if (update.productId === 'two') {
          if (failure === 'write') throw new Error('write failed');
          return;
        }
        await write(station, update);
      });
      const result = await fixEacPaths(
        api,
        'synthetic-station',
        games.map((item) => inspectEacPaths(item)!),
        vi.fn(),
        vi.fn(),
      );
      expect(result.map((item) => item.status)).toEqual(['fixed', 'error']);
      expect(api.updateProduct).toHaveBeenCalledTimes(2);
      expect(api.games.get('three')!.allowedPaths).toBeNull();
    },
  );
  it('continues after a stale preview and touches only selected findings', async () => {
    const games = [game('one'), game('two'), game('three')];
    const api = fakeApi(games);
    api.games.get('one')!.allowedPaths = '';
    const result = await fixEacPaths(
      api,
      'synthetic-station',
      games.slice(0, 2).map((item) => inspectEacPaths(item)!),
      vi.fn(),
      vi.fn(),
    );
    expect(result.map((item) => item.status)).toEqual(['skipped', 'fixed']);
    expect(api.updateProduct).toHaveBeenCalledTimes(1);
    expect(api.games.get('three')!.allowedPaths).toBeNull();
  });
});
