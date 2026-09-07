'use client';

import { FolderCog } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  getEffectiveGameSettings,
  hasCustomGameOverrides,
} from '@/lib/drova/game-activity';
import type { GameDetail } from '@/lib/drova/types';

export function GameSettingsHover({ detail }: { detail: GameDetail }) {
  const hasCustom = hasCustomGameOverrides(detail);
  const settings = getEffectiveGameSettings(detail);

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={180}
        closeDelay={140}
        render={
          <button
            type="button"
            aria-label={`Показать пути и параметры запуска для ${detail.title}`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        <Badge
          variant="outline"
          className="cursor-help underline decoration-dotted underline-offset-3"
        >
          {hasCustom ? 'Свои' : 'Стандартные'}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-[min(27rem,calc(100vw-2rem))] rounded-xl p-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium">
              <FolderCog className="size-4 shrink-0 text-primary" />
              Пути и запуск
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {detail.title}
            </p>
          </div>
          <Badge variant={hasCustom ? 'secondary' : 'outline'}>
            {hasCustom ? 'Есть свои' : 'По умолчанию'}
          </Badge>
        </div>

        <dl className="mt-3 space-y-2.5">
          {settings.map((setting) => (
            <div key={setting.key}>
              <dt className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{setting.label}</span>
                <span>{setting.isCustom ? 'Свой' : 'Стандартный'}</span>
              </dt>
              <dd className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs leading-4">
                {setting.value === null
                  ? 'Не задано'
                  : setting.value === ''
                    ? 'Пусто'
                    : setting.value}
              </dd>
            </div>
          ))}
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}
