import type { DrovaApi, GameDetail, GameSummary, ProductUpdate } from './types';

export const GAME_SYNC_MIN_INTERVAL_MS = 350;

export type SyncUpsert = {
  kind: 'add' | 'update';
  title: string;
  update: ProductUpdate;
  settingsChanges: SyncSettingChange[];
  statusChange?: SyncStatusChange;
};

export type SyncToggle = {
  productId: string;
  title: string;
  enabled: boolean;
  previousEnabled: boolean;
};

export type SyncRemoval = {
  productId: string;
  title: string;
};

export type SyncOverrideKey = 'gamePath' | 'workPath' | 'allowedPaths' | 'args';

export type SyncSettingChange = {
  key: SyncOverrideKey;
  before: string | null;
  after: string | null;
};

export type SyncStatusChange = {
  before: boolean;
  after: boolean;
};

export type GameSyncTargetPlan = {
  stationId: string;
  stationName: string;
  sourceProductCount: number;
  targetProductCount: number;
  upserts: SyncUpsert[];
  toggles: SyncToggle[];
  remove: SyncRemoval[];
};

export type GameSyncPlan = {
  sourceStationId: string;
  sourceProductCount: number;
  scope: 'full' | 'selected';
  targets: GameSyncTargetPlan[];
  readCount: number;
};

export type SyncProgress = {
  completed: number;
  total: number;
  label: string;
};

const overrideKeys: SyncOverrideKey[] = [
  'gamePath',
  'workPath',
  'allowedPaths',
  'args',
];

export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
) {
  const results = Array.from({ length: items.length }) as R[];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Keeps every product request in one queue. Mutations are never retried: a
 * rejected operation is returned to the sync state machine as-is.
 */
export function createGameRequestLimitedApi(
  api: DrovaApi,
  minIntervalMs = GAME_SYNC_MIN_INTERVAL_MS,
): DrovaApi {
  let queue: Promise<void> = Promise.resolve();
  let nextStartAt = 0;

  const schedule = <T>(operation: () => Promise<T>) => {
    const scheduled = queue.then(async () => {
      const waitMs = Math.max(0, nextStartAt - Date.now());
      if (waitMs > 0)
        await new Promise((resolve) => globalThis.setTimeout(resolve, waitMs));
      nextStartAt = Date.now() + Math.max(0, minIntervalMs);
      return operation();
    });
    queue = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  };

  return {
    ...api,
    getProducts: (serverId) => schedule(() => api.getProducts(serverId)),
    getProduct: (serverId, productId) =>
      schedule(() => api.getProduct(serverId, productId)),
    addProduct: (serverId, productId) =>
      schedule(() => api.addProduct(serverId, productId)),
    deleteProduct: (serverId, productId) =>
      schedule(() => api.deleteProduct(serverId, productId)),
    updateProduct: (serverId, update) =>
      schedule(() => api.updateProduct(serverId, update)),
    setProductEnabled: (serverId, productId, target) =>
      schedule(() => api.setProductEnabled(serverId, productId, target)),
  };
}

export async function buildGameSyncPlan(
  api: DrovaApi,
  sourceStationId: string,
  targetStations: Array<{ id: string; name: string }>,
  onProgress?: (progress: SyncProgress) => void,
  selectedProductIds?: string[],
): Promise<GameSyncPlan> {
  const allSourceProducts = await api.getProducts(sourceStationId);
  const selectedIds = selectedProductIds?.length
    ? new Set(selectedProductIds)
    : null;
  const sourceProducts = selectedIds
    ? allSourceProducts.filter((item) => selectedIds.has(item.productId))
    : allSourceProducts;
  if (selectedIds && sourceProducts.length !== selectedIds.size)
    throw new Error(
      'Часть выбранных игр больше не найдена на исходной станции. Обновите список.',
    );
  const targetProducts = await mapLimited(
    targetStations,
    1,
    async (station) => ({
      station,
      products: await api.getProducts(station.id),
    }),
  );
  const detailReads =
    sourceProducts.length +
    targetProducts.reduce((sum, target) => {
      const sourceIds = new Set(sourceProducts.map((item) => item.productId));
      return (
        sum +
        target.products.filter((item) => sourceIds.has(item.productId)).length
      );
    }, 0);
  let completed = 0;
  const report = (label: string) =>
    onProgress?.({ completed, total: Math.max(1, detailReads), label });

  const sourceDetails = await mapLimited(sourceProducts, 1, async (product) => {
    const value = await api.getProduct(sourceStationId, product.productId);
    completed += 1;
    report(value.title);
    return value;
  });
  const sourceById = new Map(
    sourceDetails.map((item) => [item.productId, item]),
  );

  const targets = await mapLimited(
    targetProducts,
    1,
    async ({ station, products }) => {
      const targetDetails = await mapLimited(
        products.filter((item) => sourceById.has(item.productId)),
        1,
        async (product) => {
          const value = await api.getProduct(station.id, product.productId);
          completed += 1;
          report(`${station.name} · ${value.title}`);
          return value;
        },
      );
      return compareTarget(
        station,
        sourceDetails,
        products,
        targetDetails,
        selectedIds === null,
      );
    },
  );

  return {
    sourceStationId,
    sourceProductCount: sourceProducts.length,
    scope: selectedIds ? 'selected' : 'full',
    targets,
    readCount: detailReads + targetStations.length + 1,
  };
}

function compareTarget(
  station: { id: string; name: string },
  sourceDetails: GameDetail[],
  targetProducts: GameSummary[],
  targetDetails: GameDetail[],
  removeExtraneous: boolean,
): GameSyncTargetPlan {
  const targetDetailsById = new Map(
    targetDetails.map((item) => [item.productId, item]),
  );
  const sourceIds = new Set(sourceDetails.map((item) => item.productId));
  const upserts: SyncUpsert[] = [];
  const toggles: SyncToggle[] = [];

  for (const source of sourceDetails) {
    const target = targetDetailsById.get(source.productId);
    if (!target) {
      upserts.push({
        kind: 'add',
        title: source.title,
        update: toUpdate(source, source.verified),
        settingsChanges: overrideKeys
          .filter((key) => source[key] !== null)
          .map((key) => ({ key, before: null, after: source[key] })),
      });
      continue;
    }
    const settingsChanges = overrideKeys
      .filter((key) => source[key] !== target[key])
      .map((key) => ({ key, before: target[key], after: source[key] }));
    const statusChange =
      source.enabled !== target.enabled
        ? { before: target.enabled, after: source.enabled }
        : undefined;
    if (settingsChanges.length) {
      upserts.push({
        kind: 'update',
        title: source.title,
        update: toUpdate(source, target.verified),
        settingsChanges,
        statusChange,
      });
    } else if (source.enabled !== target.enabled) {
      toggles.push({
        productId: source.productId,
        title: source.title,
        enabled: source.enabled,
        previousEnabled: target.enabled,
      });
    }
  }

  const remove = targetProducts
    .filter((item) => removeExtraneous && !sourceIds.has(item.productId))
    .map((item) => ({
      productId: item.productId,
      title: item.title,
    }));

  return {
    stationId: station.id,
    stationName: station.name,
    sourceProductCount: sourceDetails.length,
    targetProductCount: targetProducts.length,
    upserts,
    toggles,
    remove,
  };
}

function toUpdate(detail: GameDetail, verified: number): ProductUpdate {
  return {
    productId: detail.productId,
    verified,
    enabled: detail.enabled,
    gamePath: detail.gamePath,
    workPath: detail.workPath,
    allowedPaths: detail.allowedPaths,
    args: detail.args,
  };
}

export function syncPlanCounts(plan: GameSyncPlan) {
  return plan.targets.reduce(
    (total, target) => ({
      add:
        total.add + target.upserts.filter((item) => item.kind === 'add').length,
      update:
        total.update +
        target.upserts.filter((item) => item.kind === 'update').length,
      toggle:
        total.toggle +
        target.toggles.length +
        target.upserts.filter((item) => item.statusChange).length,
      remove: total.remove + target.remove.length,
    }),
    { add: 0, update: 0, toggle: 0, remove: 0 },
  );
}

export async function executeGameSyncPlan(
  api: DrovaApi,
  plan: GameSyncPlan,
  onProgress?: (progress: SyncProgress) => void,
) {
  const total = plan.targets.reduce(
    (sum, target) =>
      sum +
      target.upserts.length +
      target.toggles.length +
      target.remove.length +
      1,
    0,
  );
  let completed = 0;
  const completedStations: string[] = [];

  for (const target of plan.targets) {
    try {
      for (const operation of target.upserts) {
        onProgress?.({
          completed,
          total,
          label: `${target.stationName} · ${operation.title}`,
        });
        if (operation.kind === 'add') {
          await addAndConfigureProduct(api, target.stationId, operation.update);
        } else {
          await api.updateProduct(target.stationId, operation.update);
        }
        completed += 1;
      }
      for (const operation of target.toggles) {
        onProgress?.({
          completed,
          total,
          label: `${target.stationName} · ${operation.title}`,
        });
        await api.setProductEnabled(
          target.stationId,
          operation.productId,
          operation.enabled,
        );
        completed += 1;
      }
      for (const operation of target.remove) {
        onProgress?.({
          completed,
          total,
          label: `${target.stationName} · ${operation.title}`,
        });
        await api.deleteProduct(target.stationId, operation.productId);
        completed += 1;
      }
      onProgress?.({
        completed,
        total,
        label: `Проверяем ${target.stationName}`,
      });
      await verifyTarget(api, target);
      completed += 1;
      completedStations.push(target.stationId);
    } catch (cause) {
      throw new GameSyncExecutionError(
        `Синхронизация остановлена на станции «${target.stationName}».`,
        completedStations,
        target.stationId,
        cause,
      );
    }
  }
  onProgress?.({ completed: total, total, label: 'Готово' });
  return completedStations;
}

async function addAndConfigureProduct(
  api: DrovaApi,
  stationId: string,
  desired: ProductUpdate,
) {
  await api.addProduct(stationId, desired.productId);
  const added = await api.getProduct(stationId, desired.productId);
  const settingsDiffer = overrideKeys.some((key) => added[key] !== desired[key]);
  if (settingsDiffer) {
    await api.updateProduct(stationId, { ...desired, verified: added.verified });
  } else if (added.enabled !== desired.enabled) {
    await api.setProductEnabled(stationId, desired.productId, desired.enabled);
  }
}

async function verifyTarget(api: DrovaApi, target: GameSyncTargetPlan) {
  const products = await api.getProducts(target.stationId);
  const byId = new Map(products.map((item) => [item.productId, item]));
  for (const operation of target.upserts) {
    const summary = byId.get(operation.update.productId);
    if (!summary || summary.enabled !== operation.update.enabled)
      throw new Error('Readback состава не совпал.');
    const detail = await api.getProduct(
      target.stationId,
      operation.update.productId,
    );
    if (overrideKeys.some((key) => detail[key] !== operation.update[key]))
      throw new Error('Readback настроек не совпал.');
  }
  for (const operation of target.toggles) {
    if (byId.get(operation.productId)?.enabled !== operation.enabled)
      throw new Error('Readback состояния не совпал.');
  }
  for (const operation of target.remove) {
    if (byId.has(operation.productId))
      throw new Error('Readback удаления не совпал.');
  }
}

export class GameSyncExecutionError extends Error {
  constructor(
    message: string,
    readonly completedStations: string[],
    readonly failedStation: string,
    options: unknown,
  ) {
    super(message, { cause: options });
    this.name = 'GameSyncExecutionError';
  }
}
