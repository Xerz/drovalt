import type { CatalogProduct, DrovaApi, MerchantSession } from './types';

export const SESSION_HISTORY_LIMIT = 1000;
export const SESSION_HISTORY_MIN_INTERVAL_MS = 350;

export type SessionDataset = {
  sessions: MerchantSession[];
  serverNames: Record<string, string>;
  catalog: CatalogProduct[];
  updatedAt: number;
  serverIds: string[];
  deepLoadedServerIds: string[];
};

export type SessionHistoryProgress = {
  completed: number;
  total: number;
  currentServerId?: string;
  failedServerIds: string[];
  stopped: boolean;
};

export type SessionHistoryResult = SessionHistoryProgress & {
  sessions: MerchantSession[];
  successfulServerIds: string[];
};

export function sessionKey(session: MerchantSession) {
  if (session.uuid) return `uuid:${session.uuid}`;
  return JSON.stringify([
    session.created_on,
    session.finished_on ?? null,
    session.client_id ?? null,
    session.server_id ?? null,
  ]);
}

export function dedupeSessions(sessions: MerchantSession[]) {
  const seen = new Set<string>();
  return sessions
    .filter((session) => {
      const key = sessionKey(session);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.created_on - left.created_on);
}

export function uniqueSessionServerIds(sessions: MerchantSession[]) {
  return [
    ...new Set(
      sessions
        .map((session) => session.server_id?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
}

export async function fetchSessionDataset(
  api: DrovaApi,
  merchantId: string,
): Promise<SessionDataset> {
  const sessions = dedupeSessions(
    await api.getSessions({
      merchantId,
      limit: SESSION_HISTORY_LIMIT,
    }),
  );
  const [stationsResult, catalogResult] = await Promise.allSettled([
    api.getStations(merchantId),
    api.getCatalog(),
  ]);
  const stations =
    stationsResult.status === 'fulfilled' ? stationsResult.value : [];
  const serverIds = [
    ...new Set([
      ...stations.map((station) => station.uuid),
      ...uniqueSessionServerIds(sessions),
    ]),
  ].sort();
  let serverNames = Object.fromEntries(
    stations.map((station) => [station.uuid, station.name]),
  );
  if (!Object.keys(serverNames).length && serverIds.length) {
    try {
      serverNames = await api.getServerNames(serverIds);
    } catch {
      serverNames = {};
    }
  }
  return {
    sessions,
    serverNames,
    catalog: catalogResult.status === 'fulfilled' ? catalogResult.value : [],
    updatedAt: Date.now(),
    serverIds,
    deepLoadedServerIds: [],
  };
}

export async function loadSessionHistory(
  api: DrovaApi,
  merchantId: string,
  serverIds: string[],
  options: {
    minIntervalMs?: number;
    shouldStop?: () => boolean;
    onProgress?: (progress: SessionHistoryProgress) => void;
    onServerLoaded?: (serverId: string, sessions: MerchantSession[]) => void;
  } = {},
): Promise<SessionHistoryResult> {
  const minIntervalMs =
    options.minIntervalMs ?? SESSION_HISTORY_MIN_INTERVAL_MS;
  const failedServerIds: string[] = [];
  const successfulServerIds: string[] = [];
  const sessions: MerchantSession[] = [];
  let completed = 0;
  let nextStartAt = 0;
  let stopped = false;

  for (const serverId of serverIds) {
    if (options.shouldStop?.()) {
      stopped = true;
      break;
    }
    const waitMs = Math.max(0, nextStartAt - Date.now());
    if (waitMs > 0)
      await new Promise((resolve) => globalThis.setTimeout(resolve, waitMs));
    if (options.shouldStop?.()) {
      stopped = true;
      break;
    }
    nextStartAt = Date.now() + Math.max(0, minIntervalMs);
    options.onProgress?.({
      completed,
      total: serverIds.length,
      currentServerId: serverId,
      failedServerIds: [...failedServerIds],
      stopped: false,
    });
    try {
      const loaded = await api.getSessions({
        merchantId,
        serverId,
        limit: SESSION_HISTORY_LIMIT,
      });
      sessions.push(...loaded);
      successfulServerIds.push(serverId);
      options.onServerLoaded?.(serverId, loaded);
    } catch {
      failedServerIds.push(serverId);
    }
    completed += 1;
    options.onProgress?.({
      completed,
      total: serverIds.length,
      currentServerId: serverId,
      failedServerIds: [...failedServerIds],
      stopped: false,
    });
  }

  return {
    sessions: dedupeSessions(sessions),
    completed,
    total: serverIds.length,
    failedServerIds,
    successfulServerIds,
    stopped,
  };
}

export function mergeSessionDataset(
  dataset: SessionDataset,
  incoming: MerchantSession[],
  loadedServerIds: string[] = [],
): SessionDataset {
  return {
    ...dataset,
    sessions: dedupeSessions([...dataset.sessions, ...incoming]),
    updatedAt: Date.now(),
    deepLoadedServerIds: [
      ...new Set([...dataset.deepLoadedServerIds, ...loadedServerIds]),
    ].sort(),
  };
}

export function catalogNameMap(catalog: CatalogProduct[]) {
  return new Map(
    catalog.map((product) => [
      product.productId,
      product.title || product.displayName || product.productId,
    ]),
  );
}

export function sessionDuration(session: MerchantSession) {
  if (session.finished_on == null) return null;
  const duration = session.finished_on - session.created_on;
  return duration > 0 ? duration : null;
}
