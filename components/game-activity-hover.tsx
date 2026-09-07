'use client';

import { Gamepad2 } from 'lucide-react';

import { SessionActivitySummary } from '@/components/player-activity-hover';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { formatDuration } from '@/lib/drova/format';
import type { PlayerActivity } from '@/lib/drova/player-activity';

export function GameActivityHover({
  gameTitle,
  activity,
}: {
  gameTitle: string;
  activity?: PlayerActivity;
}) {
  const displayedDuration = formatDuration(activity?.totalDurationMs ?? 0);

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={220}
        closeDelay={180}
        render={
          <button
            type="button"
            className="rounded-sm text-sm font-medium tabular-nums underline decoration-dotted underline-offset-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        {displayedDuration}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-[min(21rem,calc(100vw-2rem))] rounded-xl p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium">
              <Gamepad2 className="size-4 shrink-0 text-primary" />
              Активность игры
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {gameTitle}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            30 дней
          </span>
        </div>

        {activity ? (
          <SessionActivitySummary
            activity={activity}
            histogramLabel={`Гистограмма длительности сессий игры ${gameTitle}`}
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
