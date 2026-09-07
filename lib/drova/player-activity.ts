import type { MerchantSession } from './types';

const DAY_MS = 86_400_000;
export const PLAYER_ACTIVITY_WINDOW_MS = 30 * DAY_MS;

const durationBuckets = [
  { key: 'under-15', label: 'до 15 м', maxExclusive: 15 * 60_000 },
  { key: '15-30', label: '15–30 м', maxExclusive: 30 * 60_000 },
  { key: '30-60', label: '30–60 м', maxExclusive: 60 * 60_000 },
  { key: '1-2h', label: '1–2 ч', maxExclusive: 2 * 60 * 60_000 },
  { key: 'over-2h', label: '2+ ч', maxExclusive: Number.POSITIVE_INFINITY },
] as const;

export type PlayerActivity = {
  sessionCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  histogram: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

export function buildPlayerActivityIndex(
  sessions: readonly MerchantSession[],
  now = Date.now(),
) {
  const cutoff = now - PLAYER_ACTIVITY_WINDOW_MS;
  const durations = new Map<string, number[]>();

  for (const session of sessions) {
    const clientId = session.client_id?.trim();
    const finishedAt = session.finished_on;
    if (
      !clientId ||
      finishedAt == null ||
      session.created_on < cutoff ||
      session.created_on > now
    ) {
      continue;
    }
    const duration = finishedAt - session.created_on;
    if (duration <= 0) continue;
    const clientDurations = durations.get(clientId) ?? [];
    clientDurations.push(duration);
    durations.set(clientId, clientDurations);
  }

  return new Map(
    [...durations].map(([clientId, clientDurations]) => {
      const totalDurationMs = clientDurations.reduce(
        (total, duration) => total + duration,
        0,
      );
      const activity: PlayerActivity = {
        sessionCount: clientDurations.length,
        totalDurationMs,
        averageDurationMs: totalDurationMs / clientDurations.length,
        histogram: durationBuckets.map((bucket, bucketIndex) => ({
          key: bucket.key,
          label: bucket.label,
          count: clientDurations.filter(
            (duration) =>
              duration < bucket.maxExclusive &&
              (bucketIndex === 0 ||
                duration >= durationBuckets[bucketIndex - 1].maxExclusive),
          ).length,
        })),
      };
      return [clientId, activity] as const;
    }),
  );
}
