'use client';

import { SessionActivitySummary } from '@/components/player-activity-hover';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { StationActivity } from '@/lib/drova/station-activity';

const percentFormat = new Intl.NumberFormat('ru-RU', {
  style: 'percent',
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

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={220}
        closeDelay={180}
        render={
          <button
            type="button"
            aria-label={`Длинные сессии станции ${stationName}: ${isLoading ? 'загрузка' : percentage}`}
            className="rounded-sm text-sm font-medium tabular-nums underline decoration-dotted underline-offset-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        {isLoading ? <Skeleton className="h-5 w-12" /> : percentage}
      </HoverCardTrigger>
      <HoverCardContent
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
              Больше 15 минут:{' '}
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
