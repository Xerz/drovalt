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

export type EffectiveGameSetting = {
  key: 'gamePath' | 'workPath' | 'allowedPaths' | 'args';
  label: string;
  value: string | null;
  isCustom: boolean;
};

export function getEffectiveGameSettings(
  product: Pick<
    GameDetail,
    | 'gamePath'
    | 'workPath'
    | 'allowedPaths'
    | 'args'
    | 'defaultGamePath'
    | 'defaultWorkPath'
    | 'defaultAllowedPaths'
    | 'defaultArgs'
  >,
): EffectiveGameSetting[] {
  return [
    {
      key: 'gamePath',
      label: 'Путь к игре',
      value: product.gamePath ?? product.defaultGamePath,
      isCustom: product.gamePath !== null,
    },
    {
      key: 'workPath',
      label: 'Рабочая папка',
      value: product.workPath ?? product.defaultWorkPath,
      isCustom: product.workPath !== null,
    },
    {
      key: 'allowedPaths',
      label: 'Разрешённые пути',
      value: product.allowedPaths ?? product.defaultAllowedPaths,
      isCustom: product.allowedPaths !== null,
    },
    {
      key: 'args',
      label: 'Параметры запуска',
      value: product.args ?? product.defaultArgs,
      isCustom: product.args !== null,
    },
  ];
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
