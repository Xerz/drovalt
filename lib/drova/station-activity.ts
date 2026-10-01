import {
  summarizeSessionDurations,
  type PlayerActivity,
} from './player-activity';
import { dedupeSessions } from './sessions';
import type { MerchantSession } from './types';

export const STATION_ACTIVITY_WINDOW_MS = 30 * 86_400_000;
export const LONG_SESSION_MS = 15 * 60_000;

const stationDurationBuckets = [
  { key: 'under-15', label: 'до 15 м', maxExclusive: LONG_SESSION_MS },
  { key: '15-60', label: '15–60 м', maxExclusive: 60 * 60_000 },
  { key: '1-2h', label: '1–2 ч', maxExclusive: 120 * 60_000 },
  { key: '2-4h', label: '2–4 ч', maxExclusive: 240 * 60_000 },
  { key: 'over-4h', label: '4+ ч', maxExclusive: Number.POSITIVE_INFINITY },
] as const;

export type StationActivity = PlayerActivity & {
  longSessionCount: number;
  longSessionShare: number;
  utilizationShare: number;
  longAverageDurationMs: number | null;
};

export function buildStationActivityIndex(
  sessions: readonly MerchantSession[],
  now = Date.now(),
) {
  const cutoff = now - STATION_ACTIVITY_WINDOW_MS;
  const durations = new Map<string, number[]>();

  for (const session of dedupeSessions([...sessions])) {
    const stationId = session.server_id?.trim();
    const startedAt = session.created_on;
    const finishedAt = session.finished_on;
    if (
      !stationId ||
      !Number.isFinite(startedAt) ||
      startedAt < cutoff ||
      startedAt > now ||
      finishedAt == null ||
      !Number.isFinite(finishedAt) ||
      finishedAt > now ||
      finishedAt <= startedAt
    ) {
      continue;
    }
    const stationDurations = durations.get(stationId) ?? [];
    stationDurations.push(finishedAt - startedAt);
    durations.set(stationId, stationDurations);
  }

  return new Map<string, StationActivity>(
    [...durations].map(([stationId, stationDurations]) => {
      const longDurations = stationDurations.filter(
        (duration) => duration >= LONG_SESSION_MS,
      );
      const longSessionCount = longDurations.length;
      const summary = summarizeSessionDurations(
        stationDurations,
        stationDurationBuckets,
      );
      return [
        stationId,
        {
          ...summary,
          longSessionCount,
          longSessionShare: longSessionCount / stationDurations.length,
          utilizationShare:
            summary.totalDurationMs / STATION_ACTIVITY_WINDOW_MS,
          longAverageDurationMs: longSessionCount
            ? longDurations.reduce((sum, duration) => sum + duration, 0) /
              longSessionCount
            : null,
        },
      ];
    }),
  );
}
