import { describe, expect, it } from 'vitest';

import { formatDuration } from '@/lib/drova/format';
import {
  isCurrentSession,
  sessionDisplayTiming,
} from '@/lib/drova/session-display';
import { sessionDuration } from '@/lib/drova/sessions';
import type { MerchantSession } from '@/lib/drova/types';

const start = Date.UTC(2026, 8, 10, 10);
const active: MerchantSession = { created_on: start, status: 'ACTIVE' };

describe('display-only session timing', () => {
  it('advances across an hour while completed-session duration stays empty', () => {
    const before = sessionDisplayTiming(active, start + 59 * 60_000);
    const after = sessionDisplayTiming(active, start + 60 * 60_000);
    expect(formatDuration(before.duration!)).toBe('59 мин');
    expect(formatDuration(after.duration!)).toBe('1 ч 0 мин');
    expect(sessionDuration(active)).toBeNull();
    expect(active).not.toHaveProperty('finished_on');
  });

  it('recognizes ACTIVE and HANDSHAKE only when there is no finish', () => {
    expect(
      isCurrentSession({ ...active, status: 'HANDSHAKE', finished_on: null }),
    ).toBe(true);
    expect(isCurrentSession({ ...active, status: 'FINISHED' })).toBe(false);
    expect(isCurrentSession({ ...active, status: '' })).toBe(false);
    const finished = { ...active, finished_on: start + 253 * 60_000 };
    expect(sessionDisplayTiming(finished, start + 300 * 60_000)).toEqual({
      ongoing: false,
      duration: 253 * 60_000,
    });
    expect(sessionDuration(finished)).toBe(253 * 60_000);
  });

  it('does not label missing or invalid completed durations as ongoing', () => {
    for (const finished_on of [undefined, NaN, start - 1]) {
      expect(
        sessionDisplayTiming(
          { ...active, status: 'FINISHED', finished_on },
          start,
        ),
      ).toEqual({ ongoing: false, duration: null });
    }
    expect(
      sessionDisplayTiming({ ...active, finished_on: start }, start).duration,
    ).toBe(0);
    expect(
      sessionDisplayTiming({ ...active, created_on: NaN }, start).duration,
    ).toBeNull();
    expect(sessionDisplayTiming(active, start - 60_000).duration).toBe(0);
  });
});
