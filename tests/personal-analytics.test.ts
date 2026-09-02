import { describe, expect, it } from 'vitest';

import {
  SHORT_SESSION_MS,
  billingSummary,
  buildAnalyticsSeries,
  buildBuckets,
  monthBounds,
  playerActivitySummary,
  prepareAnalyticsSessions,
  topRows,
} from '@/lib/drova/personal-analytics';
import type { MerchantSession } from '@/lib/drova/types';

describe('personal session analytics', () => {
  it('splits a session across day boundaries', () => {
    const now = Date.parse('2026-03-03T12:00:00Z');
    const rows = prepareAnalyticsSessions([
      session(
        'crossing',
        Date.parse('2026-03-01T23:30:00Z'),
        Date.parse('2026-03-02T00:30:00Z'),
      ),
    ]);
    const buckets = buildBuckets('currentMonth', 'UTC', now);
    const series = buildAnalyticsSeries(
      rows,
      buckets,
      'absoluteUtilization',
      {},
      false,
    )[0];
    expect(
      series.points.find((point) => point.label === '01.03')?.value,
    ).toBeCloseTo(0.5);
    expect(
      series.points.find((point) => point.label === '02.03')?.value,
    ).toBeCloseTo(0.5);
  });

  it('uses real DST day duration for station utilization', () => {
    const now = Date.parse('2026-03-10T12:00:00Z');
    const buckets = buildBuckets('currentMonth', 'America/New_York', now);
    const dstDay = buckets.find((bucket) => bucket.label === '08.03');
    expect(dstDay).toBeDefined();
    expect((dstDay!.endMs - dstDay!.startMs) / 3_600_000).toBe(23);
  });

  it('counts only sessions strictly shorter than five minutes', () => {
    const now = Date.parse('2026-03-03T12:00:00Z');
    const rows = prepareAnalyticsSessions([
      session(
        'short',
        Date.parse('2026-03-02T10:00:00Z'),
        Date.parse('2026-03-02T10:00:00Z') + SHORT_SESSION_MS - 1,
      ),
      session(
        'exact',
        Date.parse('2026-03-02T11:00:00Z'),
        Date.parse('2026-03-02T11:00:00Z') + SHORT_SESSION_MS,
      ),
    ]);
    const points = buildAnalyticsSeries(
      rows,
      buildBuckets('currentMonth', 'UTC', now),
      'shortSessions',
      {},
      false,
    )[0].points;
    expect(points.find((point) => point.label === '02.03')?.value).toBe(1);
  });

  it('excludes active and unsupported billing rows', () => {
    const finished = session('finished', 10, 20);
    expect(
      prepareAnalyticsSessions([
        finished,
        { ...finished, uuid: 'active', finished_on: null },
        { ...finished, uuid: 'other', billing_type: 'free' },
      ]),
    ).toHaveLength(1);
  });

  it('builds billing tops and player activity for a calendar month', () => {
    const now = Date.parse('2026-03-20T12:00:00Z');
    const period = monthBounds(0, 'UTC', now);
    const rows = prepareAnalyticsSessions([
      session(
        'one',
        Date.parse('2026-03-02T10:00:00Z'),
        Date.parse('2026-03-02T12:00:00Z'),
        'client-a',
        'prepaid',
      ),
      session(
        'two',
        Date.parse('2026-03-03T10:00:00Z'),
        Date.parse('2026-03-03T10:30:00Z'),
        'client-b',
        'subscription',
      ),
    ]);
    expect(topRows(rows, period, 'player', 'all')[0]).toMatchObject({
      id: 'client-a',
      rank: 1,
      share: 80,
    });
    expect(billingSummary(rows, period)).toMatchObject({
      prepaidMs: 7_200_000,
      subscriptionMs: 1_800_000,
    });
    expect(playerActivitySummary(rows, period, 'all')).toEqual({
      total: 2,
      overHour: 1,
      underHour: 1,
    });
  });
});

function session(
  id: string,
  created: number,
  finished: number | null,
  client = 'client-a',
  billing = 'prepaid',
): MerchantSession {
  return {
    uuid: id,
    client_id: client,
    server_id: 'server-a',
    product_id: id === 'two' ? 'game-b' : 'game-a',
    status: finished == null ? 'ACTIVE' : 'FINISHED',
    created_on: created,
    finished_on: finished,
    billing_type: billing,
  };
}
