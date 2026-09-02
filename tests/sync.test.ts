import { describe, expect, it } from 'vitest';

import { createDemoApi } from '@/lib/drova/demo';
import {
  buildGameSyncPlan,
  executeGameSyncPlan,
  GameSyncExecutionError,
  syncPlanCounts,
} from '@/lib/drova/sync';

describe('game synchronization', () => {
  it('previews additions, updates, toggles and disables before writing', async () => {
    const api = createDemoApi();
    const plan = await buildGameSyncPlan(api, 'demo-station-01', [
      { id: 'demo-station-02', name: 'Орбита' },
    ]);
    expect(syncPlanCounts(plan)).toEqual({
      add: 3,
      update: 1,
      toggle: 1,
      disable: 1,
    });
    expect(plan.sourceProductCount).toBe(6);
    expect(plan.targets[0]).toMatchObject({
      sourceProductCount: 6,
      targetProductCount: 4,
    });
    expect(
      plan.targets[0].upserts
        .filter((item) => item.kind === 'add')
        .map((item) => item.title),
    ).toEqual(['Forza Horizon 5', 'Hades II', 'Marvel Rivals']);
    expect(
      plan.targets[0].upserts.find((item) => item.kind === 'update'),
    ).toMatchObject({
      title: 'Cyberpunk 2077',
      settingsChanges: [
        { key: 'gamePath', before: null },
        { key: 'workPath', before: null },
        { key: 'args', before: null },
      ],
    });
    expect(plan.targets[0].toggles).toEqual([
      expect.objectContaining({
        title: 'Dota 2',
        previousEnabled: false,
        enabled: true,
      }),
    ]);
    expect(plan.targets[0].disable).toEqual([
      expect.objectContaining({
        title: 'War Thunder',
        previousEnabled: true,
        enabled: false,
      }),
    ]);

    let added = 0;
    const instrumentedApi = {
      ...api,
      async addProduct(serverId: string, productId: string) {
        added += 1;
        return api.addProduct(serverId, productId);
      },
    };
    await executeGameSyncPlan(instrumentedApi, plan);
    expect(added).toBe(3);
    const products = await api.getProducts('demo-station-02');
    expect(products.find((item) => item.productId === 'game-02')?.enabled).toBe(
      true,
    );
    expect(products.find((item) => item.productId === 'game-07')?.enabled).toBe(
      false,
    );
    expect(products.find((item) => item.productId === 'game-06')).toBeDefined();
    const copied = await api.getProduct('demo-station-02', 'game-01');
    expect(copied.gamePath).toContain('DrovaGames');
  }, 15_000);

  it('stops after the first failed write without retrying', async () => {
    const base = createDemoApi();
    const plan = await buildGameSyncPlan(base, 'demo-station-01', [
      { id: 'demo-station-02', name: 'Орбита' },
    ]);
    let attempts = 0;
    const api = {
      ...base,
      async updateProduct() {
        attempts += 1;
        throw new Error('write failed');
      },
    };
    await expect(executeGameSyncPlan(api, plan)).rejects.toBeInstanceOf(
      GameSyncExecutionError,
    );
    expect(attempts).toBe(1);
  });

  it('adds a missing relation before copying custom settings', async () => {
    const base = createDemoApi();
    const source = await base.getProduct('demo-station-01', 'game-01');
    const calls: string[] = [];
    const api = {
      ...base,
      async addProduct(serverId: string, productId: string) {
        calls.push('add');
        return base.addProduct(serverId, productId);
      },
      async updateProduct(serverId: string, update: Parameters<typeof base.updateProduct>[1]) {
        calls.push('update');
        return base.updateProduct(serverId, update);
      },
    };
    await executeGameSyncPlan(api, {
      sourceStationId: 'demo-station-01',
      sourceProductCount: 1,
      readCount: 1,
      targets: [{
        stationId: 'demo-empty-station',
        stationName: 'Пустая станция',
        sourceProductCount: 1,
        targetProductCount: 0,
        upserts: [{
          kind: 'add',
          title: source.title,
          update: {
            productId: source.productId,
            verified: source.verified,
            enabled: false,
            gamePath: source.gamePath,
            workPath: source.workPath,
            allowedPaths: source.allowedPaths,
            args: source.args,
          },
          settingsChanges: [{ key: 'gamePath', before: null, after: source.gamePath }],
        }],
        toggles: [],
        disable: [],
      }],
    });
    expect(calls).toEqual(['add', 'update']);
    const copied = await base.getProduct('demo-empty-station', source.productId);
    expect(copied.gamePath).toBe(source.gamePath);
    expect(copied.enabled).toBe(false);
  });
});
