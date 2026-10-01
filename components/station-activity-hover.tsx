'use client';

import { Clock3, Gauge } from 'lucide-react';

import { SessionActivitySummary } from '@/components/player-activity-hover';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration } from '@/lib/drova/format';
import type { StationActivity } from '@/lib/drova/station-activity';

const percentFormat = new Intl.NumberFormat('ru-RU', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const utilizationFormat = new Intl.NumberFormat('ru-RU', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function StationActivityHover({
  stationName,
  activity,
  isLoading,
  hasError,
}: {
  stationName: string;
  activity?: StationActivity;
  isLoading: boolean;
  hasError: boolean;
}) {
  const percentage =
    !isLoading && !hasError && activity
      ? percentFormat.format(activity.longSessionShare)
      : '—';
  const utilization =
    !isLoading && !hasError && activity
      ? utilizationFormat.format(activity.utilizationShare)
      : '—';

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={220}
        closeDelay={180}
        render={
          <button
            type="button"
            aria-label={`Длинные сессии станции ${stationName}: ${isLoading ? 'загрузка' : percentage}; утилизация: ${utilization}`}
            className="flex flex-col gap-1.5 rounded-sm text-sm font-medium tabular-nums underline decoration-dotted underline-offset-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        <span
          className="flex items-center gap-2"
          title="Доля сессий от 15 минут"
        >
          <Clock3
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          {isLoading ? <Skeleton className="h-5 w-12" /> : percentage}
        </span>
        <span
          className="flex items-center gap-2"
          title="Утилизация: отыгранное время / 720 часов"
        >
          <Gauge
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          {isLoading ? <Skeleton className="h-5 w-12" /> : utilization}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        aria-label={`Активность станции ${stationName}`}
        side="right"
        align="start"
        sideOffset={10}
        className="w-[min(21rem,calc(100vw-2rem))] rounded-xl p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">Активность станции</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {stationName}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            30 дней
          </span>
        </div>

        {isLoading ? (
          <Skeleton className="mt-4 h-32 w-full" />
        ) : hasError ? (
          <p className="mt-4 text-sm text-destructive">
            Не удалось загрузить историю сессий.
          </p>
        ) : activity ? (
          <>
            <p className="mt-4 text-sm">
              От 15 минут:{' '}
              <strong className="tabular-nums">
                {activity.longSessionCount} из {activity.sessionCount} (
                {percentage})
              </strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Завершённые сессии, начавшиеся за последние 30 дней.
            </p>
            <SessionActivitySummary
              activity={activity}
              histogramLabel={`Гистограмма длительности сессий станции ${stationName}`}
              totalDurationDetail={`${utilization} утилизации`}
              extraMetric={{
                label: 'Средняя 15+ мин',
                value:
                  activity.longAverageDurationMs == null
                    ? '—'
                    : formatDuration(activity.longAverageDurationMs),
              }}
            />
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            В загруженной истории за последние 30 дней завершённых сессий нет.
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
