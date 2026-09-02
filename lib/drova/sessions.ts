import type { CatalogProduct, DrovaApi, MerchantSession } from './types';

export const MERCHANT_SESSION_INITIAL_LIMIT = 600;
export const MERCHANT_SESSION_EXPANDED_LIMIT = 1000;

export type SessionDataset = {
  sessions: MerchantSession[];
  serverNames: Record<string, string>;
  catalog: CatalogProduct[];
  updatedAt: number;
  loadedLimit: number;
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
  limit = MERCHANT_SESSION_INITIAL_LIMIT,
): Promise<SessionDataset> {
  const sessions = dedupeSessions(
    await api.getMerchantSessions(merchantId, { limit }),
  );
  const serverIds = uniqueSessionServerIds(sessions);
  const [namesResult, catalogResult] = await Promise.allSettled([
    api.getServerNames(serverIds),
    api.getCatalog(),
  ]);
  return {
    sessions,
    serverNames: namesResult.status === 'fulfilled' ? namesResult.value : {},
    catalog: catalogResult.status === 'fulfilled' ? catalogResult.value : [],
    updatedAt: Date.now(),
    loadedLimit: limit,
  };
}

export async function loadMerchantSessionHistory(
  api: DrovaApi,
  merchantId: string,
  limit = MERCHANT_SESSION_EXPANDED_LIMIT,
) {
  return dedupeSessions(
    await api.getMerchantSessions(merchantId, { limit }),
  );
}

export function mergeSessionDataset(
  dataset: SessionDataset,
  incoming: MerchantSession[],
  loadedLimit = dataset.loadedLimit,
): SessionDataset {
  return {
    ...dataset,
    sessions: dedupeSessions([...dataset.sessions, ...incoming]),
    updatedAt: Date.now(),
    loadedLimit: Math.max(dataset.loadedLimit, loadedLimit),
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
