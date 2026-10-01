import { describe, expect, it } from 'vitest';

import {
  buildStationActivityIndex,
  STATION_ACTIVITY_WINDOW_MS,
} from '@/lib/drova/station-activity';
import type { MerchantSession } from '@/lib/drova/types';

const now = 2_000_000_000_000;
const minute = 60_000;
const cutoff = now - STATION_ACTIVITY_WINDOW_MS;

function session(
  uuid: string,
  minutes: number,
  overrides: Partial<MerchantSession> = {},
): MerchantSession {
  return {
    uuid,
    server_id: 'station-a',
    status: 'FINISHED',
    created_on: now - 86_400_000,
    finished_on: now - 86_400_000 + minutes * minute,
    ...overrides,
  };
}

describe('station activity', () => {
  it('includes exactly 15 minutes and uses all completed time for utilization', () => {
    const rows = [
      session('short', 10),
      session('exactly-15', 15),
      session('above-15', 15 + 1 / minute),
      session('long', 120, { status: 'ABORTED', billing_type: 'subscription' }),
    ];
    const activity = buildStationActivityIndex(rows, now).get('station-a');
    expect(activity).toMatchObject({
      sessionCount: 4,
      longSessionCount: 3,
      longSessionShare: 0.75,
      totalDurationMs: 160 * minute + 1,
      averageDurationMs: (160 * minute + 1) / 4,
      longAverageDurationMs: (150 * minute + 1) / 3,
      utilizationShare: (160 * minute + 1) / STATION_ACTIVITY_WINDOW_MS,
    });
    expect(activity?.histogram.map((bucket) => bucket.count)).toEqual([
      1, 2, 0, 1, 0,
    ]);
  });

  it('isolates stations, deduplicates history, includes the cutoff and uses full durations', () => {
    const atCutoff = session('cutoff', 20, {
      created_on: cutoff,
      finished_on: cutoff + 20 * minute,
    });
    const result = buildStationActivityIndex(
      [
        atCutoff,
        { ...atCutoff },
        session('before-cutoff', 60, {
          created_on: cutoff - 1,
          finished_on: cutoff + 60 * minute,
        }),
        session('second-station', 5, { server_id: 'station-b' }),
        session('no-station', 180, { server_id: null }),
      ],
      now,
    );
    expect(result.get('station-a')).toMatchObject({
      sessionCount: 1,
      longSessionShare: 1,
      totalDurationMs: 20 * minute,
    });
    expect(result.get('station-b')).toMatchObject({
      sessionCount: 1,
      longSessionShare: 0,
      longSessionCount: 0,
      longAverageDurationMs: null,
      utilizationShare: (5 * minute) / STATION_ACTIVITY_WINDOW_MS,
    });
    expect(result.size).toBe(2);
    expect(buildStationActivityIndex([atCutoff], now + 1).size).toBe(0);
  });

  it('places exact boundaries in the next bucket and preserves the station-specific labels', () => {
    const durations = [14, 15, 59, 60, 119, 120, 239, 240, 300];
    const activity = buildStationActivityIndex(
      durations.map((minutes, index) => session(`boundary-${index}`, minutes)),
      now,
    ).get('station-a');
    expect(activity?.histogram).toEqual([
      { key: 'under-15', label: 'до 15 м', count: 1 },
      { key: '15-60', label: '15–60 м', count: 2 },
      { key: '1-2h', label: '1–2 ч', count: 2 },
      { key: '2-4h', label: '2–4 ч', count: 2 },
      { key: 'over-4h', label: '4+ ч', count: 2 },
    ]);
    expect(activity?.longSessionCount).toBe(8);
  });

  it('uses a fixed 720-hour denominator', () => {
    const activity = buildStationActivityIndex(
      [
        session('day-1', 12 * 60),
        session('day-2', 12 * 60, {
          created_on: now - 2 * 86_400_000,
          finished_on: now - 2 * 86_400_000 + 12 * 3_600_000,
        }),
      ],
      now,
    ).get('station-a');
    expect(activity?.utilizationShare).toBe(24 / 720);
  });

  it('excludes ongoing, invalid, zero-length and future sessions rather than showing 0%', () => {
    const invalid = [
      session('active', 60, { status: 'ACTIVE', finished_on: null }),
      session('handshake', 60, { status: 'HANDSHAKE', finished_on: undefined }),
      session('missing-end', 60, { finished_on: undefined }),
      session('nan-start', 60, { created_on: Number.NaN }),
      session('nan-end', 60, { finished_on: Number.NaN }),
      session('infinite', 60, { finished_on: Number.POSITIVE_INFINITY }),
      session('negative', -1),
      session('zero', 0),
      session('future', 1, { created_on: now + 1, finished_on: now + minute }),
      session('future-end', 1, { finished_on: now + 1 }),
    ];
    expect(buildStationActivityIndex(invalid, now).size).toBe(0);
    expect(buildStationActivityIndex([], now).size).toBe(0);
  });
});
