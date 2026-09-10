import {
  summarizeSessionDurations,
  type PlayerActivity,
} from './player-activity';
import { dedupeSessions } from './sessions';
import type { MerchantSession } from './types';

export const STATION_ACTIVITY_WINDOW_MS = 30 * 86_400_000;
export const LONG_SESSION_MS = 15 * 60_000;

export type StationActivity = PlayerActivity & {
  longSessionCount: number;
  longSessionShare: number;
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
      const longSessionCount = stationDurations.filter(
        (duration) => duration > LONG_SESSION_MS,
      ).length;
      return [
        stationId,
        {
          ...summarizeSessionDurations(stationDurations),
          longSessionCount,
          longSessionShare: longSessionCount / stationDurations.length,
        },
      ];
    }),
  );
}
