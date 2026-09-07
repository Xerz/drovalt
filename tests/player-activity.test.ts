import { describe, expect, it } from 'vitest';

import {
  buildPlayerActivityIndex,
  PLAYER_ACTIVITY_WINDOW_MS,
} from '@/lib/drova/player-activity';
import type { MerchantSession } from '@/lib/drova/types';

describe('player activity summary', () => {
  it('builds a 30-day duration histogram for completed client sessions', () => {
    const now = 2_000_000_000_000;
    const durations = [10, 20, 45, 90, 180].map((minutes) => minutes * 60_000);
    const sessions: MerchantSession[] = durations.map((duration, index) => ({
      uuid: `session-${index}`,
      client_id: 'client-main',
      server_id: 'station-a',
      product_id: 'game-a',
      status: 'FINISHED',
      created_on: now - (index + 1) * 86_400_000,
      finished_on: now - (index + 1) * 86_400_000 + duration,
    }));
    sessions.push(
      {
        ...sessions[0],
        uuid: 'session-active',
        finished_on: null,
      },
      {
        ...sessions[0],
        uuid: 'session-old',
        created_on: now - PLAYER_ACTIVITY_WINDOW_MS - 1,
        finished_on: now - PLAYER_ACTIVITY_WINDOW_MS + 60_000,
      },
      {
        ...sessions[0],
        uuid: 'session-other-client',
        client_id: 'client-other',
      },
    );

    const summary = buildPlayerActivityIndex(sessions, now).get('client-main');

    expect(summary).toMatchObject({
      sessionCount: 5,
      totalDurationMs: durations.reduce((total, value) => total + value, 0),
      histogram: [
        { label: 'до 15 м', count: 1 },
        { label: '15–30 м', count: 1 },
        { label: '30–60 м', count: 1 },
        { label: '1–2 ч', count: 1 },
        { label: '2+ ч', count: 1 },
      ],
    });
    expect(summary?.averageDurationMs).toBe(
      durations.reduce((total, value) => total + value, 0) / durations.length,
    );
  });

  it('does not create an entry when the player has no completed sessions', () => {
    expect(
      buildPlayerActivityIndex(
        [
          {
            uuid: 'active',
            client_id: 'client-new',
            status: 'ACTIVE',
            created_on: 100,
            finished_on: null,
          },
        ],
        200,
      ).has('client-new'),
    ).toBe(false);
  });
});
