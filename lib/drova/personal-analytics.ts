import type { MerchantSession } from './types';

export const SHORT_SESSION_MS = 5 * 60_000;

export type AnalyticsPeriod = 'lastMonth' | 'currentMonth' | 'sixMonthsWeekly';
export type AnalyticsMetric =
  | 'absoluteUtilization'
  | 'stationUtilization'
  | 'shortSessions';
export type BillingFilter = 'all' | 'prepaid' | 'subscription';

export type PreparedSession = {
  source: MerchantSession;
  stationId: string;
  clientId: string;
  productId: string;
  billingType: 'prepaid' | 'subscription';
  created: number;
  finished: number;
  duration: number;
};

export type TimeBucket = {
  startMs: number;
  endMs: number;
  label: string;
};

export type AnalyticsPoint = TimeBucket & { value: number };
export type AnalyticsSeries = {
  id: string;
  name: string;
  points: AnalyticsPoint[];
};

type CalendarDate = { year: number; month: number; day: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function prepareAnalyticsSessions(raw: MerchantSession[]) {
  return raw.flatMap<PreparedSession>((session) => {
    const stationId = session.server_id?.trim() ?? '';
    const clientId = session.client_id?.trim() || 'Unknown';
    const productId = session.product_id?.trim() || 'unknown';
    const billingType = session.billing_type?.toLowerCase().trim();
    const created = Number(session.created_on);
    const finished = Number(session.finished_on);
    const duration = finished - created;
    if (
      !stationId ||
      (billingType !== 'prepaid' && billingType !== 'subscription') ||
      !Number.isFinite(created) ||
      !Number.isFinite(finished) ||
      finished <= 0 ||
      duration <= 0
    )
      return [];
    return [
      {
        source: session,
        stationId,
        clientId,
        productId,
        billingType,
        created,
        finished,
        duration,
      },
    ];
  });
}

export function buildBuckets(
  period: AnalyticsPeriod,
  timeZone: string,
  now = Date.now(),
) {
  if (period === 'lastMonth') return dailyBucketsForMonth(-1, timeZone, now);
  if (period === 'sixMonthsWeekly')
    return weeklyBucketsForSixMonths(timeZone, now);
  return dailyBucketsForMonth(0, timeZone, now);
}

export function monthBounds(
  offset: number,
  timeZone: string,
  now = Date.now(),
) {
  const current = zonedDate(now, timeZone);
  const target = addMonths(
    { year: current.year, month: current.month, day: 1 },
    offset,
  );
  const next = addMonths(target, 1);
  return {
    startMs: startOfDayMs(target, timeZone),
    endMs: offset === 0 ? now : startOfDayMs(next, timeZone),
  };
}

export function buildAnalyticsSeries(
  sessions: PreparedSession[],
  buckets: TimeBucket[],
  metric: AnalyticsMetric,
  stationNames: Record<string, string>,
  showAllStations: boolean,
): AnalyticsSeries[] {
  const stationIds = rankStations(sessions, buckets, metric);
  const name = (id: string) => stationNames[id] || id;
  if (metric === 'stationUtilization') {
    return stationIds.map((stationId) => ({
      id: stationId,
      name: name(stationId),
      points: buckets.map((bucket) => {
        const busyMs = sumOverlapMs(
          sessions.filter((session) => session.stationId === stationId),
          bucket,
        );
        return {
          ...bucket,
          value:
            bucket.endMs > bucket.startMs
              ? (busyMs / (bucket.endMs - bucket.startMs)) * 100
              : 0,
        };
      }),
    }));
  }

  const selected =
    metric === 'shortSessions'
      ? sessions.filter((session) => session.duration < SHORT_SESSION_MS)
      : sessions;
  const makePoints = (rows: PreparedSession[]) =>
    buckets.map((bucket) => ({
      ...bucket,
      value:
        metric === 'shortSessions'
          ? rows.filter(
              (session) =>
                session.created >= bucket.startMs &&
                session.created < bucket.endMs,
            ).length
          : sumOverlapMs(rows, bucket) / 3_600_000,
    }));
  const result: AnalyticsSeries[] = [
    {
      id: 'all',
      name: 'Все станции',
      points: makePoints(selected),
    },
  ];
  if (showAllStations) {
    result.push(
      ...stationIds.map((stationId) => ({
        id: stationId,
        name: name(stationId),
        points: makePoints(
          selected.filter((session) => session.stationId === stationId),
        ),
      })),
    );
  }
  return result;
}

export function topRows(
  sessions: PreparedSession[],
  period: { startMs: number; endMs: number },
  group: 'player' | 'game',
  billing: BillingFilter,
) {
  const totals = new Map<string, number>();
  let allMs = 0;
  for (const session of sessions) {
    if (billing !== 'all' && session.billingType !== billing) continue;
    const ms = overlapMs(
      session.created,
      session.finished,
      period.startMs,
      period.endMs,
    );
    if (ms <= 0) continue;
    const key = group === 'player' ? session.clientId : session.productId;
    totals.set(key, (totals.get(key) ?? 0) + ms);
    allMs += ms;
  }
  let cumulative = 0;
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([id, ms], index) => {
      cumulative += ms;
      return {
        id,
        rank: index + 1,
        hours: ms / 3_600_000,
        share: allMs > 0 ? (ms / allMs) * 100 : 0,
        cumulative: allMs > 0 ? (cumulative / allMs) * 100 : 0,
      };
    });
}

export function billingSummary(
  sessions: PreparedSession[],
  period: { startMs: number; endMs: number },
) {
  let prepaidMs = 0;
  let subscriptionMs = 0;
  for (const session of sessions) {
    const ms = overlapMs(
      session.created,
      session.finished,
      period.startMs,
      period.endMs,
    );
    if (session.billingType === 'prepaid') prepaidMs += ms;
    else subscriptionMs += ms;
  }
  return { allMs: prepaidMs + subscriptionMs, prepaidMs, subscriptionMs };
}

export function playerActivitySummary(
  sessions: PreparedSession[],
  period: { startMs: number; endMs: number },
  billing: BillingFilter,
) {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    if (billing !== 'all' && session.billingType !== billing) continue;
    const ms = overlapMs(
      session.created,
      session.finished,
      period.startMs,
      period.endMs,
    );
    if (ms > 0)
      totals.set(session.clientId, (totals.get(session.clientId) ?? 0) + ms);
  }
  const values = [...totals.values()];
  return {
    total: values.length,
    overHour: values.filter((value) => value > 3_600_000).length,
    underHour: values.filter((value) => value <= 3_600_000).length,
  };
}

export function overlapMs(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function dailyBucketsForMonth(offset: number, timeZone: string, now: number) {
  const current = zonedDate(now, timeZone);
  const targetMonth = addMonths(
    { year: current.year, month: current.month, day: 1 },
    offset,
  );
  const nextMonth = addMonths(targetMonth, 1);
  const buckets: TimeBucket[] = [];
  for (
    let day = targetMonth;
    compareDates(day, nextMonth) < 0;
    day = addDays(day, 1)
  ) {
    const nextDay = addDays(day, 1);
    const startMs = startOfDayMs(day, timeZone);
    if (offset === 0 && startMs > now) continue;
    const endMs =
      offset === 0 && compareDates(day, current) === 0
        ? now
        : startOfDayMs(nextDay, timeZone);
    buckets.push({ startMs, endMs, label: formatBucketDay(startMs, timeZone) });
    if (offset === 0 && compareDates(day, current) >= 0) break;
  }
  return buckets;
}

function weeklyBucketsForSixMonths(timeZone: string, now: number) {
  const current = zonedDate(now, timeZone);
  let week = mondayOf(addMonths(current, -6));
  const currentWeek = mondayOf(current);
  const buckets: TimeBucket[] = [];
  while (compareDates(week, addDays(currentWeek, 7)) < 0) {
    const nextWeek = addDays(week, 7);
    const startMs = startOfDayMs(week, timeZone);
    const endMs =
      compareDates(week, currentWeek) === 0
        ? now
        : startOfDayMs(nextWeek, timeZone);
    buckets.push({
      startMs,
      endMs,
      label: `${formatBucketDay(startMs, timeZone)}–${formatBucketDay(endMs - 1, timeZone)}`,
    });
    week = nextWeek;
  }
  return buckets;
}

function rankStations(
  sessions: PreparedSession[],
  buckets: TimeBucket[],
  metric: AnalyticsMetric,
) {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const value =
      metric === 'shortSessions'
        ? session.duration < SHORT_SESSION_MS &&
          buckets.some(
            (bucket) =>
              session.created >= bucket.startMs &&
              session.created < bucket.endMs,
          )
          ? 1
          : 0
        : buckets.reduce(
            (sum, bucket) =>
              sum +
              overlapMs(
                session.created,
                session.finished,
                bucket.startMs,
                bucket.endMs,
              ),
            0,
          );
    totals.set(session.stationId, (totals.get(session.stationId) ?? 0) + value);
  }
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);
}

function sumOverlapMs(sessions: PreparedSession[], bucket: TimeBucket) {
  return sessions.reduce(
    (total, session) =>
      total +
      overlapMs(
        session.created,
        session.finished,
        bucket.startMs,
        bucket.endMs,
      ),
    0,
  );
}

function getFormatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('ru-RU', { timeZone, ...options });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function zonedParts(ms: number, timeZone: string) {
  const values: Record<string, number> = {};
  getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(ms))
    .forEach((part) => {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    });
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour || 0,
    minute: values.minute || 0,
    second: values.second || 0,
  };
}

function zonedDate(ms: number, timeZone: string): CalendarDate {
  const parts = zonedParts(ms, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function zonedTimeToUtcMs(
  parts: CalendarDate & {
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  },
  timeZone: string,
) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0,
    parts.millisecond || 0,
  );
  let guess = target;
  for (let index = 0; index < 4; index += 1) {
    const actual = zonedParts(guess, timeZone);
    const actualMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      parts.millisecond || 0,
    );
    const difference = actualMs - target;
    guess -= difference;
    if (difference === 0) break;
  }
  return guess;
}

function startOfDayMs(date: CalendarDate, timeZone: string) {
  return zonedTimeToUtcMs(
    { ...date, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone,
  );
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function addMonths(date: CalendarDate, months: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: 1,
  };
}

function mondayOf(date: CalendarDate) {
  const day = new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

function compareDates(left: CalendarDate, right: CalendarDate) {
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}

function formatBucketDay(ms: number, timeZone: string) {
  return getFormatter(timeZone, { day: '2-digit', month: '2-digit' }).format(
    new Date(ms),
  );
}
