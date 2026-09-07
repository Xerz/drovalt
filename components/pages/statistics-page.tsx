'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Server,
  WalletCards,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { useMerchant } from '@/components/merchant-context';
import { PersonalStatistics } from '@/components/pages/personal-statistics';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDuration,
  integerFormatter,
  moneyFormatter,
} from '@/lib/drova/format';
import { summarizeOpenedPrepaidDeals } from '@/lib/drova/finance';
import type { UsageStat } from '@/lib/drova/types';
import { useSessionData } from '@/hooks/use-session-data';

type PeriodKey = 'todayStat' | 'weekStat' | 'monthStat';
const periods: Array<{ key: PeriodKey; label: string }> = [
  { key: 'todayStat', label: 'Сегодня' },
  { key: 'weekStat', label: 'Неделя' },
  { key: 'monthStat', label: 'Месяц' },
];

const chartConfig = {
  income: { label: 'Доход', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function StatisticsPage() {
  const { api, account, mode, setSettingsOpen } = useMerchant();
  const [periodKey, setPeriodKey] = useState<PeriodKey>('monthStat');
  const [expandedStation, setExpandedStation] = useState('');

  const usageQuery = useQuery({
    queryKey: ['usage', mode],
    queryFn: () => api.getUsage(),
    enabled: Boolean(account),
  });
  const stationsQuery = useQuery({
    queryKey: ['stations', mode, account?.uuid],
    queryFn: () => api.getStations(account!.uuid),
    enabled: Boolean(account),
  });
  const unpaidQuery = useQuery({
    queryKey: ['unpaid', mode, account?.uuid],
    queryFn: () => api.getUnpaidStats(account!.uuid),
    enabled: Boolean(account),
  });
  const openedDealsQuery = useQuery({
    queryKey: ['opened-prepaid-deals', mode, account?.uuid],
    queryFn: () => api.getOpenedPrepaidDeals(),
    enabled: Boolean(account),
  });
  const sessionsQuery = useSessionData();

  const openedDealTotals = useMemo(
    () => summarizeOpenedPrepaidDeals(openedDealsQuery.data ?? []),
    [openedDealsQuery.data],
  );

  const period = usageQuery.data?.[periodKey];
  const stationNames = useMemo(
    () =>
      new Map(
        (stationsQuery.data ?? []).map((station) => [
          station.uuid,
          station.name,
        ]),
      ),
    [stationsQuery.data],
  );
  const rows = useMemo(
    () =>
      period
        ? Object.entries(period.perServerStats)
            .map(([id, value]) => ({
              id,
              name: stationNames.get(id) ?? `Станция ${id.slice(0, 8)}`,
              ...value,
            }))
            .sort(
              (a, b) =>
                b.totalStat.totalIncome - a.totalStat.totalIncome ||
                b.totalStat.totalMsecs - a.totalStat.totalMsecs,
            )
        : [],
    [period, stationNames],
  );
  const chartData = rows
    .slice(0, 8)
    .map((row) => ({
      name: compactName(row.name),
      income: row.totalStat.totalIncome,
    }));

  const refresh = () => {
    void usageQuery.refetch();
    void stationsQuery.refetch();
    void unpaidQuery.refetch();
    void openedDealsQuery.refetch();
    void sessionsQuery.refetch();
  };
  const latestUpdatedAt = Math.max(
    usageQuery.dataUpdatedAt,
    stationsQuery.dataUpdatedAt,
    unpaidQuery.dataUpdatedAt,
    openedDealsQuery.dataUpdatedAt,
    sessionsQuery.dataUpdatedAt,
  );
  const isRefreshing =
    usageQuery.isFetching ||
    stationsQuery.isFetching ||
    unpaidQuery.isFetching ||
    openedDealsQuery.isFetching ||
    sessionsQuery.isFetching;
  const openedDealsError =
    openedDealsQuery.error instanceof Error
      ? openedDealsQuery.error.message
      : undefined;

  if (!account) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-9">
        <Header
          periodKey={periodKey}
          setPeriodKey={setPeriodKey}
          refresh={refresh}
          disabled
          updatedAt={0}
        />
        <div className="mt-7 rounded-2xl border border-dashed p-12 text-center">
          <BarChart3 className="mx-auto size-6 text-primary" />
          <h2 className="mt-4 font-semibold">
            Статистика появится после подключения
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Подключите merchant token или включите демо-режим.
          </p>
          <Button className="mt-5" onClick={() => setSettingsOpen(true)}>
            Открыть настройки
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-9">
      <Header
        periodKey={periodKey}
        setPeriodKey={setPeriodKey}
        refresh={refresh}
        disabled={isRefreshing}
        updatedAt={latestUpdatedAt}
      />

      {usageQuery.isPending ? (
        <StatisticsSkeleton />
      ) : usageQuery.error ? (
        <Alert variant="destructive" className="mt-7">
          <AlertTitle>Статистика использования недоступна</AlertTitle>
          <AlertDescription>
            {usageQuery.error instanceof Error
              ? usageQuery.error.message
              : 'Неизвестная ошибка.'}
          </AlertDescription>
        </Alert>
      ) : (
        period && (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={Server}
                label="Сессии"
                value={integerFormatter.format(period.totalStat.sessionCount)}
                hint={
                  periods.find((item) => item.key === periodKey)?.label ?? ''
                }
              />
              <MetricCard
                icon={Clock3}
                label="Суммарное время"
                value={formatDuration(period.totalStat.totalMsecs)}
                hint="по всем станциям"
              />
              <MetricCard
                icon={CircleDollarSign}
                label="Доход"
                value={moneyFormatter.format(period.totalStat.totalIncome)}
                hint="значение Drova API"
              />
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle>Станции за период</CardTitle>
                  <CardDescription>
                    Сессии, время и доход с возможностью раскрыть игры.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader className="bg-muted/45">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Станция</TableHead>
                        <TableHead>Сессии</TableHead>
                        <TableHead>Время</TableHead>
                        <TableHead className="pr-5 text-right">Доход</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <StationStatRows
                          key={row.id}
                          row={row}
                          expanded={expandedStation === row.id}
                          onToggle={() =>
                            setExpandedStation((current) =>
                              current === row.id ? '' : row.id,
                            )
                          }
                          mode={mode}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Доход по станциям</CardTitle>
                  <CardDescription>
                    Восемь лидеров выбранного периода.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.some((item) => item.income > 0) ? (
                    <ChartContainer
                      config={chartConfig}
                      className="h-[300px] w-full aspect-auto"
                    >
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ left: 0, right: 16 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tickLine={false}
                          axisLine={false}
                          width={92}
                          tick={{ fontSize: 11 }}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              formatter={(value) =>
                                moneyFormatter.format(Number(value))
                              }
                            />
                          }
                        />
                        <Bar
                          dataKey="income"
                          fill="var(--color-income)"
                          radius={[0, 6, 6, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div className="grid h-[300px] place-items-center text-center text-sm text-muted-foreground">
                      За этот период доход равен нулю.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )
      )}

      <PersonalStatistics />

      <section className="mt-9">
        <div className="flex items-center gap-2">
          <WalletCards className="size-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">
            Открытые выплаты и лимиты
          </h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MoneyCard
            label="Сумма открытых выплат"
            value={moneyFormatter.format(openedDealTotals.gross)}
            hint={`Открытых выплат: ${integerFormatter.format(openedDealsQuery.data?.length ?? 0)}`}
            error={openedDealsError}
          />
          <MoneyCard
            label="К выплате после комиссий"
            value={moneyFormatter.format(openedDealTotals.payout)}
            hint="После комиссии сервиса и платёжной системы"
            error={openedDealsError}
          />
          <MoneyCard
            label="Пробный лимит"
            value={formatDuration(
              unpaidQuery.data?.trial_msecs_left ??
                account.trial_msecs_left ??
                0,
            )}
            error={
              unpaidQuery.error instanceof Error
                ? unpaidQuery.error.message
                : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}

function Header({
  periodKey,
  setPeriodKey,
  refresh,
  disabled,
  updatedAt,
}: {
  periodKey: PeriodKey;
  setPeriodKey(value: PeriodKey): void;
  refresh(): void;
  disabled: boolean;
  updatedAt: number;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
          <BarChart3 className="size-4" />
          Сводка мерчанта
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">
          Статистика
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Использование станций и текущие денежные показатели.
        </p>
      </div>
      <div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl bg-muted p-1">
            {periods.map((period) => (
              <Button
                key={period.key}
                variant={periodKey === period.key ? 'secondary' : 'ghost'}
                size="sm"
                className={
                  periodKey === period.key ? 'bg-background shadow-sm' : ''
                }
                onClick={() => setPeriodKey(period.key)}
              >
                {period.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" disabled={disabled} onClick={refresh}>
            <RefreshCw className={disabled ? 'animate-spin' : ''} />
            Обновить
          </Button>
        </div>
        <p className="mt-2 text-right text-xs text-muted-foreground">
          {updatedAt
            ? `Последнее получение: ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(updatedAt)}`
            : 'Данные ещё не получены'}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}
function MoneyCard({
  label,
  value,
  hint,
  error,
}: {
  label: string;
  value: string;
  hint?: string;
  error?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {error ? 'Недоступно' : value}
        </CardTitle>
        {!error && hint && (
          <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
        )}
      </CardHeader>
      {error && (
        <CardContent>
          <p className="text-xs text-destructive">{error}</p>
        </CardContent>
      )}
    </Card>
  );
}

function StationStatRows({
  row,
  expanded,
  onToggle,
  mode,
}: {
  row: {
    id: string;
    name: string;
    totalStat: UsageStat;
    perGameStats: Record<string, UsageStat>;
  };
  expanded: boolean;
  onToggle(): void;
  mode: string;
}) {
  const { api } = useMerchant();
  const productsQuery = useQuery({
    queryKey: ['products', mode, row.id],
    queryFn: () => api.getProducts(row.id),
    enabled: expanded,
  });
  const names = new Map(
    (productsQuery.data ?? []).map((game) => [game.productId, game.title]),
  );
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="pl-5">
          <button
            type="button"
            className="flex items-center gap-2 text-left font-medium"
          >
            {expanded ? (
              <ChevronDown className="size-4 text-primary" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <span className="max-w-[260px] truncate">{row.name}</span>
          </button>
        </TableCell>
        <TableCell>
          {integerFormatter.format(row.totalStat.sessionCount)}
        </TableCell>
        <TableCell>{formatDuration(row.totalStat.totalMsecs)}</TableCell>
        <TableCell className="pr-5 text-right font-medium">
          {moneyFormatter.format(row.totalStat.totalIncome)}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={4} className="px-5 py-4">
            {productsQuery.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(row.perGameStats)
                  .sort((a, b) => b[1].totalMsecs - a[1].totalMsecs)
                  .map(([id, stat]) => (
                    <div
                      key={id}
                      className="rounded-lg border bg-background p-3"
                    >
                      <p className="truncate text-sm font-medium">
                        {names.get(id) ?? `Игра ${id.slice(0, 8)}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {integerFormatter.format(stat.sessionCount)} сессий ·{' '}
                        {formatDuration(stat.totalMsecs)} ·{' '}
                        {moneyFormatter.format(stat.totalIncome)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function compactName(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value;
}
function StatisticsSkeleton() {
  return (
    <div className="mt-7 space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
