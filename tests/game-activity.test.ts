import { describe, expect, it } from 'vitest';

import {
  buildGameActivityIndex,
  GAME_ACTIVITY_WINDOW_MS,
  getEffectiveGameSettings,
  hasCustomGameOverrides,
} from '@/lib/drova/game-activity';
import type { GameDetail, MerchantSession } from '@/lib/drova/types';

describe('game activity', () => {
  it('uses the four station overrides instead of catalog metadata', () => {
    expect(hasCustomGameOverrides(game(null, null, null, null))).toBe(false);
    expect(hasCustomGameOverrides(game('', null, null, null))).toBe(true);
    expect(hasCustomGameOverrides(game(null, null, null, '-high'))).toBe(true);
  });

  it('shows effective paths while preserving empty custom overrides', () => {
    const detail = game(null, '', 'D:\\Shared', null);

    expect(getEffectiveGameSettings(detail)).toEqual([
      {
        key: 'gamePath',
        label: 'Путь к игре',
        value: 'C:\\Games\\Game.exe',
        isCustom: false,
      },
      {
        key: 'workPath',
        label: 'Рабочая папка',
        value: '',
        isCustom: true,
      },
      {
        key: 'allowedPaths',
        label: 'Разрешённые пути',
        value: 'D:\\Shared',
        isCustom: true,
      },
      {
        key: 'args',
        label: 'Параметры запуска',
        value: '',
        isCustom: false,
      },
    ]);
  });

  it('sums session overlap from the last 30 days for the selected station', () => {
    const now = 2_000_000_000_000;
    const cutoff = now - GAME_ACTIVITY_WINDOW_MS;
    const sessions: MerchantSession[] = [
      session(
        'inside',
        'station-a',
        'game-a',
        now - 3 * 60 * 60_000,
        now - 60 * 60_000,
      ),
      session(
        'boundary',
        'station-a',
        'game-a',
        cutoff - 60 * 60_000,
        cutoff + 60 * 60_000,
      ),
      session('other-game', 'station-a', 'game-b', now - 45 * 60_000, now),
      session(
        'other-station',
        'station-b',
        'game-a',
        now - 5 * 60 * 60_000,
        now,
      ),
      {
        ...session('active', 'station-a', 'game-a', now - 15 * 60_000, now),
        finished_on: null,
      },
    ];

    const activity = buildGameActivityIndex(sessions, 'station-a', now);

    expect(activity.get('game-a')).toMatchObject({
      sessionCount: 2,
      totalDurationMs: 3 * 60 * 60_000,
      averageDurationMs: 1.5 * 60 * 60_000,
      histogram: [
        { label: 'до 15 м', count: 0 },
        { label: '15–30 м', count: 0 },
        { label: '30–60 м', count: 0 },
        { label: '1–2 ч', count: 1 },
        { label: '2+ ч', count: 1 },
      ],
    });
    expect(activity.get('game-b')?.totalDurationMs).toBe(45 * 60_000);
  });
});

function game(
  gamePath: string | null,
  workPath: string | null,
  allowedPaths: string | null,
  args: string | null,
): GameDetail {
  return {
    productId: 'game-a',
    title: 'Game A',
    published: true,
    defaultGamePath: 'C:\\Games\\Game.exe',
    defaultWorkPath: 'C:\\Games',
    defaultAllowedPaths: '',
    defaultArgs: '',
    gamePath,
    workPath,
    allowedPaths,
    args,
    enabled: true,
    verified: 2,
    available: true,
  };
}

function session(
  uuid: string,
  serverId: string,
  productId: string,
  createdOn: number,
  finishedOn: number,
): MerchantSession {
  return {
    uuid,
    client_id: 'client-a',
    server_id: serverId,
    product_id: productId,
    status: 'FINISHED',
    created_on: createdOn,
    finished_on: finishedOn,
    billing_type: 'prepaid',
  };
}
