import type { DrovaApi, GameDetail, GameSummary, ProductUpdate } from './types';

export type SyncUpsert = {
  kind: 'add' | 'update';
  title: string;
  update: ProductUpdate;
};

export type SyncToggle = {
  productId: string;
  title: string;
  enabled: boolean;
};

export type GameSyncTargetPlan = {
  stationId: string;
  stationName: string;
  upserts: SyncUpsert[];
  toggles: SyncToggle[];
  disable: SyncToggle[];
};

export type GameSyncPlan = {
  sourceStationId: string;
  targets: GameSyncTargetPlan[];
  readCount: number;
};

export type SyncProgress = {
  completed: number;
  total: number;
  label: string;
};

const overrideKeys = ['gamePath', 'workPath', 'allowedPaths', 'args'] as const;

export async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = Array.from({ length: items.length }) as R[];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function buildGameSyncPlan(
  api: DrovaApi,
  sourceStationId: string,
  targetStations: Array<{ id: string; name: string }>,
  onProgress?: (progress: SyncProgress) => void,
): Promise<GameSyncPlan> {
  const sourceProducts = await api.getProducts(sourceStationId);
  const targetProducts = await mapLimited(targetStations, 4, async (station) => ({
    station,
    products: await api.getProducts(station.id),
  }));
  const detailReads = sourceProducts.length + targetProducts.reduce((sum, target) => {
    const sourceIds = new Set(sourceProducts.map((item) => item.productId));
    return sum + target.products.filter((item) => sourceIds.has(item.productId)).length;
  }, 0);
  let completed = 0;
  const report = (label: string) => onProgress?.({ completed, total: Math.max(1, detailReads), label });

  const sourceDetails = await mapLimited(sourceProducts, 6, async (product) => {
    const value = await api.getProduct(sourceStationId, product.productId);
    completed += 1;
    report(value.title);
    return value;
  });
  const sourceById = new Map(sourceDetails.map((item) => [item.productId, item]));

  const targets = await mapLimited(targetProducts, 2, async ({ station, products }) => {
    const targetDetails = await mapLimited(
      products.filter((item) => sourceById.has(item.productId)),
      6,
      async (product) => {
        const value = await api.getProduct(station.id, product.productId);
        completed += 1;
        report(`${station.name} · ${value.title}`);
        return value;
      },
    );
    return compareTarget(station, sourceDetails, products, targetDetails);
  });

  return { sourceStationId, targets, readCount: detailReads + targetStations.length + 1 };
}

function compareTarget(
  station: { id: string; name: string },
  sourceDetails: GameDetail[],
  targetProducts: GameSummary[],
  targetDetails: GameDetail[],
): GameSyncTargetPlan {
  const targetDetailsById = new Map(targetDetails.map((item) => [item.productId, item]));
  const sourceIds = new Set(sourceDetails.map((item) => item.productId));
  const upserts: SyncUpsert[] = [];
  const toggles: SyncToggle[] = [];

  for (const source of sourceDetails) {
    const target = targetDetailsById.get(source.productId);
    if (!target) {
      upserts.push({ kind: 'add', title: source.title, update: toUpdate(source, source.verified) });
      continue;
    }
    const settingsDiffer = overrideKeys.some((key) => source[key] !== target[key]);
    if (settingsDiffer) {
      upserts.push({ kind: 'update', title: source.title, update: toUpdate(source, target.verified) });
    } else if (source.enabled !== target.enabled) {
      toggles.push({ productId: source.productId, title: source.title, enabled: source.enabled });
    }
  }

  const disable = targetProducts
    .filter((item) => !sourceIds.has(item.productId) && item.enabled)
    .map((item) => ({ productId: item.productId, title: item.title, enabled: false }));

  return { stationId: station.id, stationName: station.name, upserts, toggles, disable };
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
      add: total.add + target.upserts.filter((item) => item.kind === 'add').length,
      update: total.update + target.upserts.filter((item) => item.kind === 'update').length,
      toggle: total.toggle + target.toggles.length,
      disable: total.disable + target.disable.length,
    }),
    { add: 0, update: 0, toggle: 0, disable: 0 },
  );
}

export async function executeGameSyncPlan(
  api: DrovaApi,
  plan: GameSyncPlan,
  onProgress?: (progress: SyncProgress) => void,
) {
  const total = plan.targets.reduce(
    (sum, target) => sum + target.upserts.length + target.toggles.length + target.disable.length + 1,
    0,
  );
  let completed = 0;
  const completedStations: string[] = [];

  for (const target of plan.targets) {
    try {
      for (const operation of target.upserts) {
        onProgress?.({ completed, total, label: `${target.stationName} · ${operation.title}` });
        await api.updateProduct(target.stationId, operation.update);
        completed += 1;
      }
      for (const operation of target.toggles) {
        onProgress?.({ completed, total, label: `${target.stationName} · ${operation.title}` });
        await api.setProductEnabled(target.stationId, operation.productId, operation.enabled);
        completed += 1;
      }
      for (const operation of target.disable) {
        onProgress?.({ completed, total, label: `${target.stationName} · ${operation.title}` });
        await api.setProductEnabled(target.stationId, operation.productId, false);
        completed += 1;
      }
      onProgress?.({ completed, total, label: `Проверяем ${target.stationName}` });
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

async function verifyTarget(api: DrovaApi, target: GameSyncTargetPlan) {
  const products = await api.getProducts(target.stationId);
  const byId = new Map(products.map((item) => [item.productId, item]));
  for (const operation of target.upserts) {
    const summary = byId.get(operation.update.productId);
    if (!summary || summary.enabled !== operation.update.enabled) throw new Error('Readback состава не совпал.');
    const detail = await api.getProduct(target.stationId, operation.update.productId);
    if (overrideKeys.some((key) => detail[key] !== operation.update[key])) throw new Error('Readback настроек не совпал.');
  }
  for (const operation of [...target.toggles, ...target.disable]) {
    if (byId.get(operation.productId)?.enabled !== operation.enabled) throw new Error('Readback состояния не совпал.');
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
