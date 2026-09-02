'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Eye,
  EyeOff,
  Globe2,
  ListPlus,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useMerchant } from '@/components/merchant-context';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
  sessionDatasetQueryKey,
  useSessionData,
} from '@/hooks/use-session-data';
import { getGeoIp, type GeoIpResult } from '@/lib/drova/geoip';
import { buildSessionCsv } from '@/lib/drova/session-csv';
import {
  catalogNameMap,
  loadMerchantSessionHistory,
  MERCHANT_SESSION_EXPANDED_LIMIT,
  mergeSessionDataset,
  sessionDuration,
  type SessionDataset,
} from '@/lib/drova/sessions';
import type { MerchantSession } from '@/lib/drova/types';

type SessionRow = {
  source: MerchantSession;
  uuid: string;
  status: string;
  clientId: string;
  creatorIp: string;
  city: string;
  isp: string;
  productName: string;
  serverName: string;
  createdAt: number;
  finishedAt: number | null;
  duration: number | null;
  billing: string;
  score: string;
  scoreText: string;
  serverId: string;
  productId: string;
  desktop: string;
  scoreReason: string;
  abortComment: string;
};

const rangeOptions = [
  ['lastMonth', 'Прошлый месяц'],
  ['currentMonth', 'Текущий месяц'],
  ['last30', '30 дней'],
  ['last7', '7 дней'],
  ['last90', '90 дней'],
] as const;

export function SessionsPage() {
  const { api, account, mode, setSettingsOpen } = useMerchant();
  const queryClient = useQueryClient();
  const sessionsQuery = useSessionData();
  const [detailed, setDetailed] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const draggedColumn = useRef<string | null>(null);
  const [geoState, setGeoState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'partial' | 'error';
    lookup?: (ip: string) => GeoIpResult;
  }>({ status: 'idle' });

  useEffect(() => {
    if (!sessionsQuery.data?.sessions.length) return;
    if (mode === 'demo') {
      setGeoState({
        status: 'ready',
        lookup: (ip) => ({
          city: ip
            ? ['Екатеринбург', 'Москва', 'Казань'][
                Number(ip.split('.').at(-1) ?? 0) % 3
              ]
            : '',
          isp: ip ? 'DemoNet' : '',
        }),
      });
      return;
    }
    let active = true;
    setGeoState({ status: 'loading' });
    void getGeoIp()
      .then((result) => {
        if (!active) return;
        setGeoState({
          status:
            result.cityAvailable && result.asnAvailable
              ? 'ready'
              : result.cityAvailable || result.asnAvailable
                ? 'partial'
                : 'error',
          lookup: (ip) => result.lookup.lookup(ip),
        });
      })
      .catch(() => {
        if (active) setGeoState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [mode, sessionsQuery.data?.sessions.length]);

  const productNames = useMemo(
    () => catalogNameMap(sessionsQuery.data?.catalog ?? []),
    [sessionsQuery.data?.catalog],
  );
  const rows = useMemo(
    () =>
      (sessionsQuery.data?.sessions ?? []).map((session) => {
        const ip = session.creator_ip ?? '';
        const geo = geoState.lookup?.(ip) ?? { city: '', isp: '' };
        const productId = session.product_id ?? '';
        const serverId = session.server_id ?? '';
        return {
          source: session,
          uuid: session.uuid ?? '',
          status: session.status,
          clientId: session.client_id ?? '',
          creatorIp: ip,
          city: geo.city,
          isp: geo.isp,
          productName: productNames.get(productId) ?? productId,
          serverName: sessionsQuery.data?.serverNames[serverId] ?? serverId,
          createdAt: session.created_on,
          finishedAt: session.finished_on ?? null,
          duration: sessionDuration(session),
          billing: session.billing_type ?? '',
          score: session.score == null ? '' : String(session.score),
          scoreText: session.score_text ?? '',
          serverId,
          productId,
          desktop:
            sessionsQuery.data?.catalog.find(
              (item) => item.productId === productId,
            )?.useDefaultDesktop == null
              ? ''
              : String(
                  sessionsQuery.data?.catalog.find(
                    (item) => item.productId === productId,
                  )?.useDefaultDesktop,
                ),
          scoreReason: session.score_reason ?? '',
          abortComment: session.abort_comment ?? '',
        } satisfies SessionRow;
      }),
    [geoState, productNames, sessionsQuery.data],
  );

  const dateFilteredRows = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return rows.filter(
      (row) =>
        (from == null || row.createdAt >= from) &&
        (to == null || row.createdAt <= to),
    );
  }, [dateFrom, dateTo, rows]);

  const columns = useMemo<ColumnDef<SessionRow>[]>(() => {
    const base: ColumnDef<SessionRow>[] = [
      textColumn('clientId', 'Client ID', (row) => row.clientId, 165),
      textColumn('creatorIp', 'IP', (row) => row.creatorIp, 125),
      textColumn('city', 'Город', (row) => row.city, 130),
      textColumn('isp', 'ISP', (row) => row.isp, 180),
      textColumn('productName', 'Игра', (row) => row.productName, 190),
      textColumn('serverName', 'Станция', (row) => row.serverName, 170),
      dateColumn('createdAt', 'Начало', (row) => row.createdAt),
      durationColumn('duration', 'Длительность', (row) => row.duration),
      textColumn('billing', 'Billing', (row) => row.billing, 105),
      dateColumn('finishedAt', 'Окончание', (row) => row.finishedAt),
      textColumn('score', 'Score', (row) => row.score, 82),
      textColumn('scoreText', 'Оценка', (row) => row.scoreText, 210),
    ];
    if (!detailed) return base;
    return [
      textColumn('status', 'Статус', (row) => row.status, 110),
      textColumn('uuid', 'UUID', (row) => row.uuid, 210),
      ...base,
      textColumn('serverId', 'Server ID', (row) => row.serverId, 210),
      textColumn('productId', 'Product ID', (row) => row.productId, 210),
      numberColumn('createdRaw', 'created_on', (row) => row.createdAt),
      numberColumn('finishedRaw', 'finished_on', (row) => row.finishedAt),
      textColumn('desktop', 'Desktop', (row) => row.desktop, 90),
      textColumn('scoreReason', 'Score reason', (row) => row.scoreReason, 170),
      textColumn(
        'abortComment',
        'Abort comment',
        (row) => row.abortComment,
        210,
      ),
    ];
  }, [detailed]);

  const table = useReactTable({
    data: dateFilteredRows,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const activeRows = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);
  const totals = summarizeRows(activeRows);
  const canLoadMore =
    (sessionsQuery.data?.loadedLimit ?? 0) < MERCHANT_SESSION_EXPANDED_LIMIT;

  const loadMore = async () => {
    if (!sessionsQuery.data || !account || loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    setHistoryError('');
    const key = sessionDatasetQueryKey(mode, account?.uuid);
    try {
      const loaded = await loadMerchantSessionHistory(
        api,
        account.uuid,
        MERCHANT_SESSION_EXPANDED_LIMIT,
      );
      queryClient.setQueryData<SessionDataset>(key, (current) =>
        current
          ? mergeSessionDataset(
              current,
              loaded,
              MERCHANT_SESSION_EXPANDED_LIMIT,
            )
          : current,
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить расширенную историю.',
      );
    } finally {
      setLoadingMore(false);
    }
  };

  if (!account)
    return <DisconnectedSessions onConnect={() => setSettingsOpen(true)} />;

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-7 md:px-7 md:py-9">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
            <CalendarRange className="size-4" />
            История использования
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">
            Сессии
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Фильтруйте, сравнивайте и выгружайте историю без управления
            lifecycle.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-9 gap-1.5 px-3">
            <Globe2 className="size-3.5" />
            {geoLabel(geoState.status, mode)}
          </Badge>
          <Button
            variant="outline"
            disabled={sessionsQuery.isFetching}
            onClick={() => void sessionsQuery.refetch()}
          >
            <RefreshCw
              className={sessionsQuery.isFetching ? 'animate-spin' : ''}
            />
            Обновить
          </Button>
        </div>
      </div>

      {sessionsQuery.isPending ? (
        <SessionsSkeleton />
      ) : sessionsQuery.error ? (
        <Alert variant="destructive" className="mt-7">
          <AlertTitle>Сессии недоступны</AlertTitle>
          <AlertDescription>
            {sessionsQuery.error instanceof Error
              ? sessionsQuery.error.message
              : 'Неизвестная ошибка.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Строк после фильтров"
              value={formatInteger(totals.count)}
            />
            <SummaryCard
              label="Средняя сессия"
              value={formatDuration(totals.averageMs)}
            />
            <SummaryCard
              label="Суммарное время"
              value={formatDuration(totals.totalMs)}
            />
            <SummaryCard
              label="Prepaid"
              value={`${formatHours(totals.prepaidMs)} ч`}
            />
            <SummaryCard
              label="Subscription"
              value={`${formatHours(totals.subscriptionMs)} ч`}
            />
          </div>

          <Card className="mt-5 overflow-hidden">
            <CardHeader className="gap-4 border-b bg-muted/15">
              <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
                <div>
                  <CardTitle className="text-base">История сессий</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Получено{' '}
                    {sessionsQuery.data
                      ? formatTimestamp(sessionsQuery.data.updatedAt)
                      : '—'}{' '}
                    · {formatInteger(rows.length)} уникальных строк
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetailed((value) => !value);
                      setColumnVisibility({});
                      setColumnOrder([]);
                    }}
                  >
                    {detailed ? <EyeOff /> : <Eye />}
                    {detailed ? 'Human only' : 'Все поля'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" />}>
                      <Columns3 />
                      Колонки
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Видимость колонок</DropdownMenuLabel>
                      {table.getAllLeafColumns().map((column) => (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          checked={column.getIsVisible()}
                          onCheckedChange={(checked) =>
                            column.toggleVisibility(Boolean(checked))
                          }
                        >
                          {columnLabel(column.id)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setColumnFilters([]);
                      setDateFrom('');
                      setDateTo('');
                    }}
                  >
                    <RotateCcw />
                    Очистить фильтры
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setExportOpen(true)}
                    disabled={!activeRows.length}
                  >
                    <Download />
                    CSV
                  </Button>
                  <Button
                    onClick={() => void loadMore()}
                    disabled={!canLoadMore || loadingMore}
                  >
                    {loadingMore ? (
                      <RefreshCw className="animate-spin" />
                    ) : (
                      <ListPlus />
                    )}
                    {canLoadMore ? 'Загрузить до 1000' : 'История загружена'}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  От
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="w-40 bg-background"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  До
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="w-40 bg-background"
                  />
                </label>
                {rangeOptions.map(([key, label]) => (
                  <Button
                    key={key}
                    variant="secondary"
                    size="sm"
                    onClick={() => applyRange(key, setDateFrom, setDateTo)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {historyError && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {historyError}
                </p>
              )}
            </CardHeader>

            <CardContent className="p-0">
              <div className="max-h-[640px] overflow-auto">
                <Table className="min-w-max">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    {table.getHeaderGroups().map((group) => (
                      <TableRow key={group.id} className="hover:bg-transparent">
                        {group.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            style={{ minWidth: header.getSize() }}
                            className="align-top"
                            draggable
                            onDragStart={() => {
                              draggedColumn.current = header.column.id;
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              const source = draggedColumn.current;
                              const target = header.column.id;
                              if (!source || source === target) return;
                              const order = table
                                .getAllLeafColumns()
                                .map((column) => column.id);
                              order.splice(order.indexOf(source), 1);
                              order.splice(order.indexOf(target), 0, source);
                              setColumnOrder(order);
                              draggedColumn.current = null;
                            }}
                            title="Перетащите заголовок, чтобы изменить порядок"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 py-1 text-left"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {header.column.getCanSort() && (
                                <ArrowDownUp className="size-3.5 text-muted-foreground" />
                              )}
                            </button>
                            {header.column.getCanFilter() &&
                              ![
                                'createdAt',
                                'finishedAt',
                                'duration',
                                'createdRaw',
                                'finishedRaw',
                              ].includes(header.column.id) && (
                                <Input
                                  value={displayText(
                                    header.column.getFilterValue(),
                                  )}
                                  onChange={(event) =>
                                    header.column.setFilterValue(
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Фильтр…"
                                  className="mt-1 h-7 min-w-24 text-xs font-normal"
                                />
                              )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              className="max-w-[280px] truncate font-mono text-xs"
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={table.getVisibleLeafColumns().length}
                          className="h-32 text-center text-muted-foreground"
                        >
                          По выбранным фильтрам сессий нет.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col justify-between gap-3 border-t px-4 py-3 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground">
                  Страница {table.getState().pagination.pageIndex + 1} из{' '}
                  {Math.max(1, table.getPageCount())}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                  >
                    <ChevronLeft />
                    Назад
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                  >
                    Вперёд
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Экспортировать чувствительные данные?
            </AlertDialogTitle>
            <AlertDialogDescription>
              В CSV попадут видимые колонки и отфильтрованные строки, включая
              полные IP и client ID. Файл останется только на этом устройстве.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                exportCsv(table);
                setExportOpen(false);
              }}
            >
              Скачать CSV
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function textColumn(
  id: string,
  header: string,
  accessor: (row: SessionRow) => string,
  size = 130,
): ColumnDef<SessionRow> {
  return {
    id,
    header,
    accessorFn: accessor,
    size,
    filterFn: 'includesString',
    cell: ({ getValue }) => displayText(getValue()) || '—',
  };
}
function numberColumn(
  id: string,
  header: string,
  accessor: (row: SessionRow) => number | null,
): ColumnDef<SessionRow> {
  return {
    id,
    header,
    accessorFn: accessor,
    size: 150,
    cell: ({ getValue }) => (getValue() == null ? '—' : String(getValue())),
  };
}
function dateColumn(
  id: string,
  header: string,
  accessor: (row: SessionRow) => number | null,
): ColumnDef<SessionRow> {
  return {
    id,
    header,
    accessorFn: accessor,
    size: 155,
    cell: ({ getValue }) =>
      typeof getValue() === 'number'
        ? formatTimestamp(getValue() as number)
        : '—',
  };
}
function durationColumn(
  id: string,
  header: string,
  accessor: (row: SessionRow) => number | null,
): ColumnDef<SessionRow> {
  return {
    id,
    header,
    accessorFn: accessor,
    size: 115,
    cell: ({ getValue }) =>
      typeof getValue() === 'number'
        ? formatDuration(getValue() as number)
        : 'Идёт',
  };
}

function summarizeRows(rows: SessionRow[]) {
  let totalMs = 0;
  let prepaidMs = 0;
  let subscriptionMs = 0;
  let completed = 0;
  for (const row of rows) {
    if (row.duration == null) continue;
    completed += 1;
    totalMs += row.duration;
    if (row.billing.toLowerCase() === 'prepaid') prepaidMs += row.duration;
    if (row.billing.toLowerCase() === 'subscription')
      subscriptionMs += row.duration;
  }
  return {
    count: rows.length,
    totalMs,
    prepaidMs,
    subscriptionMs,
    averageMs: completed ? totalMs / completed : 0,
  };
}

function applyRange(
  key: (typeof rangeOptions)[number][0],
  setFrom: (value: string) => void,
  setTo: (value: string) => void,
) {
  const now = new Date();
  let from = new Date(now);
  let to = new Date(now);
  if (key === 'currentMonth')
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (key === 'lastMonth') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  }
  if (key === 'last7') from.setDate(from.getDate() - 6);
  if (key === 'last30') from.setDate(from.getDate() - 29);
  if (key === 'last90') from.setDate(from.getDate() - 89);
  setFrom(toDateInput(from));
  setTo(toDateInput(to));
}

function exportCsv(table: ReturnType<typeof useReactTable<SessionRow>>) {
  const columns = table.getVisibleLeafColumns();
  const csv = buildSessionCsv(
    columns.map((column) => columnLabel(column.id)),
    table.getFilteredRowModel().rows.map((row) =>
      columns.map((column) => {
        const value = row.getValue(column.id);
        if (
          ['createdAt', 'finishedAt'].includes(column.id) &&
          typeof value === 'number'
        )
          return formatTimestamp(value);
        if (column.id === 'duration' && typeof value === 'number')
          return formatDuration(value);
        return value;
      }),
    ),
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `drova-sessions-${toDateInput(new Date())}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function columnLabel(id: string) {
  const labels: Record<string, string> = {
    clientId: 'Client ID',
    creatorIp: 'IP',
    city: 'Город',
    isp: 'ISP',
    productName: 'Игра',
    serverName: 'Станция',
    createdAt: 'Начало',
    duration: 'Длительность',
    billing: 'Billing',
    finishedAt: 'Окончание',
    score: 'Score',
    scoreText: 'Оценка',
    status: 'Статус',
    uuid: 'UUID',
    serverId: 'Server ID',
    productId: 'Product ID',
    createdRaw: 'created_on',
    finishedRaw: 'finished_on',
    desktop: 'Desktop',
    scoreReason: 'Score reason',
    abortComment: 'Abort comment',
  };
  return labels[id] ?? id;
}
function geoLabel(status: string, mode: string) {
  if (mode === 'demo') return 'GeoIP: демо';
  if (status === 'loading') return 'GeoIP загружается';
  if (status === 'ready') return 'GeoIP готов';
  if (status === 'partial') return 'GeoIP частично';
  if (status === 'error') return 'GeoIP недоступен';
  return 'GeoIP ожидает данные';
}
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
function DisconnectedSessions({ onConnect }: { onConnect(): void }) {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-9">
      <div className="mt-20 rounded-2xl border border-dashed p-12 text-center">
        <CalendarRange className="mx-auto size-6 text-primary" />
        <h2 className="mt-4 font-semibold">
          Сессии появятся после подключения
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Подключите merchant token или включите демо-режим.
        </p>
        <Button className="mt-5" onClick={onConnect}>
          Открыть настройки
        </Button>
      </div>
    </div>
  );
}
function SessionsSkeleton() {
  return (
    <div className="mt-7 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-[560px]" />
    </div>
  );
}

const integer = new Intl.NumberFormat('ru-RU');
const hours = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
function formatInteger(value: number) {
  return integer.format(value);
}
function formatHours(value: number) {
  return hours.format(value / 3_600_000);
}
function formatDuration(ms: number) {
  if (!(ms > 0)) return '0с';
  let seconds = Math.floor(ms / 1000);
  const hoursValue = Math.floor(seconds / 3600);
  seconds -= hoursValue * 3600;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return hoursValue > 0
    ? `${hoursValue}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`;
}
function formatTimestamp(ms: number) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(ms);
}
function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayText(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  return JSON.stringify(value);
}
