import { overlapMs, prepareAnalyticsSessions } from './personal-analytics';
import { summarizeSessionDurations } from './player-activity';
import type { GameDetail, MerchantSession } from './types';

export const GAME_ACTIVITY_WINDOW_MS = 30 * 86_400_000;

export function hasCustomGameOverrides(
  product: Pick<GameDetail, 'gamePath' | 'workPath' | 'allowedPaths' | 'args'>,
) {
  return [
    product.gamePath,
    product.workPath,
    product.allowedPaths,
    product.args,
  ].some((value) => value !== null);
}

export function buildGameActivityIndex(
  sessions: readonly MerchantSession[],
  serverId: string,
  now = Date.now(),
) {
  const start = now - GAME_ACTIVITY_WINDOW_MS;
  const durations = new Map<string, number[]>();

  for (const session of prepareAnalyticsSessions([...sessions])) {
    if (session.stationId !== serverId) continue;
    const playedMs = overlapMs(session.created, session.finished, start, now);
    if (playedMs <= 0) continue;
    const productDurations = durations.get(session.productId) ?? [];
    productDurations.push(playedMs);
    durations.set(session.productId, productDurations);
  }

  return new Map(
    [...durations].map(
      ([productId, productDurations]) =>
        [productId, summarizeSessionDurations(productDurations)] as const,
    ),
  );
}
