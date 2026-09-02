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

    await executeGameSyncPlan(api, plan);
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
});
