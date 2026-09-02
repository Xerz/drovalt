'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Activity, Clock3, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useMerchant } from '@/components/merchant-context';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  sessionDatasetQueryKey,
  useSessionData,
} from '@/hooks/use-session-data';
import {
  billingSummary,
  buildAnalyticsSeries,
  buildBuckets,
  monthBounds,
  playerActivitySummary,
  prepareAnalyticsSessions,
  topRows,
  type AnalyticsMetric,
  type AnalyticsPeriod,
  type BillingFilter,
} from '@/lib/drova/personal-analytics';
import {
  catalogNameMap,
  loadSessionHistory,
  mergeSessionDataset,
  type SessionDataset,
  type SessionHistoryProgress,
} from '@/lib/drova/sessions';

const TIME_ZONE_KEY = 'drovalt.analyticsTimeZone.v1';
const periods: Array<{ key: AnalyticsPeriod; label: string }> = [
  { key: 'lastMonth', label: 'Прошлый месяц · дни' },
  { key: 'currentMonth', label: 'Текущий месяц · дни' },
  { key: 'sixMonthsWeekly', label: '6 месяцев · недели' },
];
const metrics: Array<{ key: AnalyticsMetric; label: string }> = [
  { key: 'absoluteUtilization', label: 'Абсолютная утилизация' },
  { key: 'stationUtilization', label: 'По станциям' },
  { key: 'shortSessions', label: 'Короткие сессии' },
];
const colors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#ec4899',
  '#06b6d4',
];

export function PersonalStatistics() {
  const { api, account, mode } = useMerchant();
  const queryClient = useQueryClient();
  const sessionsQuery = useSessionData();
  const [timeZone, setTimeZone] = useState('UTC');
  const [period, setPeriod] = useState<AnalyticsPeriod>('currentMonth');
  const [metric, setMetric] = useState<AnalyticsMetric>('absoluteUtilization');
  const [showAllStations, setShowAllStations] = useState(false);
  const [fanoutProgress, setFanoutProgress] =
    useState<SessionHistoryProgress | null>(null);
  const [fanoutFailures, setFanoutFailures] = useState(0);
  const fanoutRunning = useRef(false);
  const fanoutStop = useRef(false);
  const sessionDataRef = useRef(sessionsQuery.data);
  sessionDataRef.current = sessionsQuery.data;
  const sessionServerKey = (sessionsQuery.data?.serverIds ?? []).join('|');

  useEffect(() => {
    const browserZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setTimeZone(window.localStorage.getItem(TIME_ZONE_KEY) || browserZone);
  }, []);

  useEffect(() => {
    const sessionData = sessionDataRef.current;
    if (!account || !sessionData || fanoutRunning.current) return;
    const remaining = sessionData.serverIds.filter(
      (id) => !sessionData.deepLoadedServerIds.includes(id),
    );
    if (!remaining.length) return;

    fanoutRunning.current = true;
    fanoutStop.current = false;
    setFanoutFailures(0);
    const key = sessionDatasetQueryKey(mode, account.uuid);
    void loadSessionHistory(api, account.uuid, remaining, {
      shouldStop: () => fanoutStop.current,
      onProgress: setFanoutProgress,
      onServerLoaded: (serverId, loaded) => {
        queryClient.setQueryData<SessionDataset>(key, (current) =>
          current ? mergeSessionDataset(current, loaded, [serverId]) : current,
        );
      },
    })
      .then((result) => {
        setFanoutFailures(result.failedServerIds.length);
        setFanoutProgress({
          completed: result.completed,
          total: result.total,
          failedServerIds: result.failedServerIds,
          stopped: result.stopped,
        });
      })
      .finally(() => {
        fanoutRunning.current = false;
      });

    return () => {
      fanoutStop.current = true;
    };
  }, [account, api, mode, queryClient, sessionServerKey]);

  const prepared = useMemo(
    () => prepareAnalyticsSessions(sessionsQuery.data?.sessions ?? []),
    [sessionsQuery.data?.sessions],
  );
  const buckets = useMemo(
    () => buildBuckets(period, timeZone),
    [period, timeZone],
  );
  const series = useMemo(
    () =>
      buildAnalyticsSeries(
        prepared,
        buckets,
        metric,
        sessionsQuery.data?.serverNames ?? {},
        showAllStations,
      ),
    [
      buckets,
      metric,
      prepared,
      sessionsQuery.data?.serverNames,
      showAllStations,
    ],
  );
  const chartData = useMemo(
    () =>
      buckets.map((bucket, index) =>
        Object.fromEntries([
          ['label', bucket.label],
          ...series.map((item) => [item.id, item.points[index]?.value ?? 0]),
        ]),
      ),
    [buckets, series],
  );
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        series.map((item, index) => [
          item.id,
          {
            label: item.name,
            color: colors[index % colors.length],
          },
        ]),
      ) satisfies ChartConfig,
    [series],
  );

  const zones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : ['UTC', timeZone];
    return [...new Set([timeZone, ...supported])];
  }, [timeZone]);

  return (
    <section className="mt-10 border-t pt-9">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Activity className="size-4" />
            Персональная аналитика
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
            Как используются ваши станции
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Сессии, утилизация и концентрация игроков за календарные периоды.
          </p>
        </div>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Часовой пояс
          <NativeSelect
            value={timeZone}
            onChange={(event) => {
              setTimeZone(event.target.value);
              window.localStorage.setItem(TIME_ZONE_KEY, event.target.value);
            }}
            className="w-full sm:w-72"
          >
            {zones.map((zone) => (
              <NativeSelectOption key={zone} value={zone}>
                {zone}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>

      {sessionsQuery.isPending ? (
        <div className="mt-5 space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-[380px]" />
        </div>
      ) : sessionsQuery.error ? (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>Персональная аналитика недоступна</AlertTitle>
          <AlertDescription>
            {sessionsQuery.error instanceof Error
              ? sessionsQuery.error.message
              : 'Не удалось загрузить историю сессий.'}{' '}
            Основная финансовая сводка продолжает работать.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card className="mt-5">
            <CardHeader className="gap-4">
              <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
                <div>
                  <CardTitle>Динамика использования</CardTitle>
                  <CardDescription>
                    {formatInteger(prepared.length)} завершённых сессий · данные
                    получены{' '}
                    {sessionsQuery.data
                      ? formatTimestamp(sessionsQuery.data.updatedAt)
                      : '—'}
                    {fanoutProgress && (
                      <>
                        {' '}
                        · станции {fanoutProgress.completed}/
                        {fanoutProgress.total}
                      </>
                    )}
                  </CardDescription>
                  {fanoutFailures > 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      Не удалось дочитать {fanoutFailures} станций; успешные
                      результаты сохранены.
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={showAllStations}
                    onCheckedChange={setShowAllStations}
                    disabled={metric === 'stationUtilization'}
                  />
                  Показать все станции
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex flex-wrap rounded-xl bg-muted p-1">
                  {periods.map((item) => (
                    <Button
                      key={item.key}
                      variant={period === item.key ? 'secondary' : 'ghost'}
                      size="sm"
                      className={
                        period === item.key ? 'bg-background shadow-sm' : ''
                      }
                      onClick={() => setPeriod(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap rounded-xl bg-muted p-1">
                  {metrics.map((item) => (
                    <Button
                      key={item.key}
                      variant={metric === item.key ? 'secondary' : 'ghost'}
                      size="sm"
                      className={
                        metric === item.key ? 'bg-background shadow-sm' : ''
                      }
                      onClick={() => setMetric(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length && series.length ? (
                <ChartContainer
                  config={chartConfig}
                  className="h-[360px] w-full aspect-auto"
                >
                  <LineChart
                    data={chartData}
                    margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tick={{ fontSize: 11 }}
                      unit={metric === 'stationUtilization' ? '%' : undefined}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {series.map((item, index) => (
                      <Line
                        key={item.id}
                        dataKey={item.id}
                        name={item.name}
                        type="monotone"
                        stroke={colors[index % colors.length]}
                        strokeWidth={item.id === 'all' ? 2.6 : 1.6}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="grid h-[320px] place-items-center text-sm text-muted-foreground">
                  Для выбранного периода нет завершённых сессий.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-5 2xl:grid-cols-2">
            <TopMonthPair
              title="Топ-10 игроков"
              icon={UsersRound}
              group="player"
              sessions={prepared}
              timeZone={timeZone}
              names={new Map()}
            />
            <TopMonthPair
              title="Топ-10 игр"
              icon={Clock3}
              group="game"
              sessions={prepared}
              timeZone={timeZone}
              names={catalogNameMap(sessionsQuery.data?.catalog ?? [])}
            />
          </div>
        </>
      )}
    </section>
  );
}

function TopMonthPair({
  title,
  icon: Icon,
  group,
  sessions,
  timeZone,
  names,
}: {
  title: string;
  icon: typeof UsersRound;
  group: 'player' | 'game';
  sessions: ReturnType<typeof prepareAnalyticsSessions>;
  timeZone: string;
  names: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>
          Доля считается от всего времени выбранного billing-типа.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-2">
        <TopMonth
          title="Прошлый месяц"
          offset={-1}
          group={group}
          sessions={sessions}
          timeZone={timeZone}
          names={names}
        />
        <TopMonth
          title="Текущий месяц"
          offset={0}
          group={group}
          sessions={sessions}
          timeZone={timeZone}
          names={names}
        />
      </CardContent>
    </Card>
  );
}

function TopMonth({
  title,
  offset,
  group,
  sessions,
  timeZone,
  names,
}: {
  title: string;
  offset: number;
  group: 'player' | 'game';
  sessions: ReturnType<typeof prepareAnalyticsSessions>;
  timeZone: string;
  names: Map<string, string>;
}) {
  const [billing, setBilling] = useState<BillingFilter>('all');
  const bounds = useMemo(
    () => monthBounds(offset, timeZone),
    [offset, timeZone],
  );
  const rows = useMemo(
    () => topRows(sessions, bounds, group, billing),
    [billing, bounds, group, sessions],
  );
  const totals = useMemo(
    () => billingSummary(sessions, bounds),
    [bounds, sessions],
  );
  const players = useMemo(
    () =>
      group === 'player'
        ? playerActivitySummary(sessions, bounds, billing)
        : null,
    [billing, bounds, group, sessions],
  );
  const billingHours =
    billing === 'prepaid'
      ? totals.prepaidMs
      : billing === 'subscription'
        ? totals.subscriptionMs
        : totals.allMs;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatHours(billingHours)} ч
        </span>
      </div>
      <div className="mt-3 flex rounded-lg bg-muted p-1">
        {(['all', 'prepaid', 'subscription'] as BillingFilter[]).map((item) => (
          <Button
            key={item}
            variant={billing === item ? 'secondary' : 'ghost'}
            size="sm"
            className={`flex-1 px-2 text-xs ${billing === item ? 'bg-background shadow-sm' : ''}`}
            onClick={() => setBilling(item)}
          >
            {item === 'all' ? 'Все' : item}
          </Button>
        ))}
      </div>
      {players && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Уникальных: {players.total} · больше часа: {players.overHour} · до
          часа: {players.underHour}
        </p>
      )}
      <div className="mt-3 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">#</TableHead>
              <TableHead>{group === 'player' ? 'Игрок' : 'Игра'}</TableHead>
              <TableHead className="text-right">Часы</TableHead>
              <TableHead className="text-right">Доля</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.rank}
                  </TableCell>
                  <TableCell className="max-w-36 truncate text-xs font-medium">
                    {group === 'player'
                      ? shortId(row.id)
                      : (names.get(row.id) ?? shortId(row.id))}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatHours(row.hours * 3_600_000)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    <span>{formatPercent(row.share)}%</span>
                    <span className="ml-1 text-muted-foreground">
                      · {formatPercent(row.cumulative)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-20 text-center text-xs text-muted-foreground"
                >
                  Нет данных
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const integer = new Intl.NumberFormat('ru-RU');
const hours = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
function formatInteger(value: number) {
  return integer.format(value);
}
function formatHours(ms: number) {
  return hours.format(ms / 3_600_000);
}
function formatPercent(value: number) {
  return percent.format(value);
}
function formatTimestamp(ms: number) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(ms);
}
function shortId(value: string) {
  return value.length <= 6 ? value : `…${value.slice(-6)}`;
}
