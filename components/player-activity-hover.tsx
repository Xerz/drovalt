'use client';

import { Clock3, UsersRound } from 'lucide-react';

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration } from '@/lib/drova/format';
import type { PlayerActivity } from '@/lib/drova/player-activity';

export function PlayerActivityHover({
  clientLabel,
  activity,
  isLoading,
  hasError,
}: {
  clientLabel: string;
  activity?: PlayerActivity;
  isLoading: boolean;
  hasError: boolean;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={220}
        closeDelay={180}
        render={
          <button
            type="button"
            className="rounded-sm text-xs text-muted-foreground underline decoration-dotted underline-offset-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        Клиент {clientLabel}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-[min(21rem,calc(100vw-2rem))] rounded-xl p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Активность игрока</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Завершённые сессии за 30 дней
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {clientLabel}
          </span>
        </div>

        {isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : hasError ? (
          <p className="mt-4 text-sm text-destructive">
            Не удалось загрузить историю сессий.
          </p>
        ) : activity ? (
          <SessionActivitySummary
            activity={activity}
            histogramLabel="Гистограмма длительности сессий игрока"
          />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            За последние 30 дней завершённых сессий нет.
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function SessionActivitySummary({
  activity,
  histogramLabel,
}: {
  activity: PlayerActivity;
  histogramLabel: string;
}) {
  const maximum = Math.max(
    1,
    ...activity.histogram.map((bucket) => bucket.count),
  );

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-2">
        <CompactMetric
          icon={<UsersRound className="size-3.5" />}
          label="Сессии"
          value={String(activity.sessionCount)}
        />
        <CompactMetric
          icon={<Clock3 className="size-3.5" />}
          label="Всего"
          value={formatDuration(activity.totalDurationMs)}
        />
        <CompactMetric
          icon={<Clock3 className="size-3.5" />}
          label="Средняя"
          value={formatDuration(activity.averageDurationMs)}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">
          Распределение по длительности
        </p>
        <figure className="mt-2 grid h-24 grid-cols-5 items-end gap-2">
          <figcaption className="sr-only">{histogramLabel}</figcaption>
          {activity.histogram.map((bucket) => (
            <div
              key={bucket.key}
              className="flex h-full min-w-0 flex-col items-center justify-end gap-1"
            >
              <span className="sr-only">
                {bucket.label}: {bucket.count}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {bucket.count}
              </span>
              <span
                className={`w-full max-w-8 rounded-t-sm ${bucket.count ? 'bg-primary/80' : 'bg-muted'}`}
                style={{
                  height: bucket.count
                    ? `${Math.max(14, (bucket.count / maximum) * 100)}%`
                    : '4px',
                }}
              />
              <span className="truncate text-[10px] text-muted-foreground">
                {bucket.label}
              </span>
            </div>
          ))}
        </figure>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        По загруженной истории сессий. Активные сессии не учитываются.
      </p>
    </div>
  );
}

function CompactMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
