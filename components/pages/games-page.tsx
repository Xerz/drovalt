'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  Copy,
  Gamepad2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useMerchant } from '@/components/merchant-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type {
  CatalogProduct,
  GameDetail,
  GameSummary,
  Station,
} from '@/lib/drova/types';
import {
  buildGameSyncPlan,
  executeGameSyncPlan,
  syncPlanCounts,
  type GameSyncPlan,
  type GameSyncTargetPlan,
  type SyncOverrideKey,
  type SyncProgress,
} from '@/lib/drova/sync';

type GameFilter = 'all' | 'enabled' | 'disabled';

const formSchema = z.object({
  gamePath: z.string().max(2_000),
  workPath: z.string().max(2_000),
  allowedPaths: z.string().max(8_000),
  args: z.string().max(8_000),
});
type GameForm = z.infer<typeof formSchema>;
type OverrideKey = keyof GameForm;

const fieldMeta: Array<{
  key: OverrideKey;
  defaultKey: keyof GameDetail;
  label: string;
  multiline?: boolean;
}> = [
  { key: 'gamePath', defaultKey: 'defaultGamePath', label: 'Путь к игре' },
  { key: 'workPath', defaultKey: 'defaultWorkPath', label: 'Рабочая папка' },
  {
    key: 'allowedPaths',
    defaultKey: 'defaultAllowedPaths',
    label: 'Разрешённые пути',
    multiline: true,
  },
  {
    key: 'args',
    defaultKey: 'defaultArgs',
    label: 'Параметры запуска',
    multiline: true,
  },
];

export function GamesPage() {
  const { api, account, mode, setSettingsOpen } = useMerchant();
  const queryClient = useQueryClient();
  const [selectedStationId, setSelectedStationId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GameFilter>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingProductId, setEditingProductId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const stationsQuery = useQuery({
    queryKey: ['stations', mode, account?.uuid],
    queryFn: () => api.getStations(account!.uuid),
    enabled: Boolean(account),
  });
  const stations = useMemo(
    () => stationsQuery.data ?? [],
    [stationsQuery.data],
  );

  useEffect(() => {
    if (
      stations.length &&
      !stations.some((station) => station.uuid === selectedStationId)
    )
      setSelectedStationId(stations[0].uuid);
  }, [stations, selectedStationId]);

  const productsQuery = useQuery({
    queryKey: ['products', mode, selectedStationId],
    queryFn: () => api.getProducts(selectedStationId),
    enabled: Boolean(selectedStationId && account),
  });

  const enabledMutation = useMutation({
    mutationFn: async ({
      product,
      target,
    }: {
      product: GameSummary;
      target: boolean;
    }) => {
      await api.setProductEnabled(selectedStationId, product.productId, target);
      const readback = await api.getProduct(
        selectedStationId,
        product.productId,
      );
      if (readback.enabled !== target)
        throw new Error('Drova не подтвердил состояние игры.');
      return readback;
    },
    onMutate: () => setActionError(''),
    onSuccess: (readback) =>
      queryClient.setQueryData<GameSummary[]>(
        ['products', mode, selectedStationId],
        (current = []) =>
          current.map((item) =>
            item.productId === readback.productId
              ? { ...item, enabled: readback.enabled }
              : item,
          ),
      ),
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : 'Не удалось изменить игру.',
      );
      void productsQuery.refetch();
    },
  });

  const visibleProducts = useMemo(
    () =>
      (productsQuery.data ?? []).filter((product) => {
        const matchesSearch = product.title
          .toLocaleLowerCase('ru')
          .includes(search.trim().toLocaleLowerCase('ru'));
        const matchesFilter =
          filter === 'all' ||
          (filter === 'enabled' ? product.enabled : !product.enabled);
        return matchesSearch && matchesFilter;
      }),
    [productsQuery.data, search, filter],
  );

  const columns = useMemo<ColumnDef<GameSummary>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Название <ArrowUpDown />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="max-w-[420px]">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.original.productId}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'available',
        header: 'Доступность',
        cell: ({ row }) => (
          <Badge variant={row.original.available ? 'secondary' : 'outline'}>
            {row.original.available ? 'Доступна' : 'Недоступна'}
          </Badge>
        ),
      },
      {
        accessorKey: 'published',
        header: 'В каталоге',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.published ? 'Да' : 'Нет'}
          </span>
        ),
      },
      {
        accessorKey: 'useDefaultDesktop',
        header: 'Настройки',
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.useDefaultDesktop ? 'Стандартные' : 'Свои'}
          </Badge>
        ),
      },
      {
        accessorKey: 'enabled',
        header: 'Включена',
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            disabled={
              enabledMutation.isPending &&
              enabledMutation.variables?.product.productId ===
                row.original.productId
            }
            aria-label={`Включить ${row.original.title}`}
            onCheckedChange={(target) =>
              enabledMutation.mutate({ product: row.original, target })
            }
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingProductId(row.original.productId)}
          >
            <Pencil />
            Изменить
          </Button>
        ),
      },
    ],
    [enabledMutation],
  );

  const table = useReactTable({
    data: visibleProducts,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const selectedStation = stations.find(
    (station) => station.uuid === selectedStationId,
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-9">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
            <Gamepad2 className="size-4" />
            Библиотека мерчанта
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">
            Игры
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Настройки запуска и доступность игр для выбранной станции.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!selectedStationId || productsQuery.isFetching}
            onClick={() => void productsQuery.refetch()}
          >
            <RefreshCw
              className={productsQuery.isFetching ? 'animate-spin' : ''}
            />
            Обновить
          </Button>
          <Button
            disabled={!selectedStationId || productsQuery.isPending}
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Добавить игру
          </Button>
          <Button
            variant="outline"
            disabled={stations.length < 2 || !selectedStationId}
            onClick={() => setCopyOpen(true)}
          >
            <Copy />
            Скопировать список
          </Button>
        </div>
      </div>

      {!account ? (
        <div className="mt-7 rounded-2xl border border-dashed p-12 text-center">
          <Server className="mx-auto size-6 text-primary" />
          <h2 className="mt-4 font-semibold">Выберите режим работы</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Подключите merchant token или включите демо-режим.
          </p>
          <Button className="mt-5" onClick={() => setSettingsOpen(true)}>
            Открыть настройки
          </Button>
        </div>
      ) : stationsQuery.isPending ? (
        <GamesSkeleton />
      ) : (
        <>
          <div className="mt-7 flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="station-select">Выбранная станция</Label>
              <NativeSelect
                id="station-select"
                className="w-full"
                value={selectedStationId}
                onChange={(event) => setSelectedStationId(event.target.value)}
              >
                {stations.map((station) => (
                  <NativeSelectOption key={station.uuid} value={station.uuid}>
                    {station.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Найти игру"
                aria-label="Поиск игр"
              />
            </div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <NativeSelect
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as GameFilter)
                }
                aria-label="Фильтр игр"
              >
                <NativeSelectOption value="all">Все</NativeSelectOption>
                <NativeSelectOption value="enabled">
                  Включённые
                </NativeSelectOption>
                <NativeSelectOption value="disabled">
                  Выключенные
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          {actionError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {productsQuery.error ? (
            <Alert variant="destructive" className="mt-7">
              <AlertTitle>Не удалось загрузить игры</AlertTitle>
              <AlertDescription>
                {productsQuery.error instanceof Error
                  ? productsQuery.error.message
                  : 'Неизвестная ошибка.'}
              </AlertDescription>
            </Alert>
          ) : productsQuery.isPending ? (
            <GamesSkeleton />
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-[0_18px_60px_-44px_rgb(0_0_0/0.45)]">
              <Table>
                <TableHeader className="bg-muted/45">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header, index) => (
                        <TableHead
                          key={header.id}
                          className={
                            index === 0
                              ? 'h-11 pl-5'
                              : index === headerGroup.headers.length - 1
                                ? 'pr-5 text-right'
                                : ''
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="h-[68px]">
                        {row.getVisibleCells().map((cell, index) => (
                          <TableCell
                            key={cell.id}
                            className={
                              index === 0
                                ? 'pl-5'
                                : index === row.getVisibleCells().length - 1
                                  ? 'pr-5 text-right'
                                  : ''
                            }
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
                        colSpan={columns.length}
                        className="h-40 text-center text-muted-foreground"
                      >
                        Ничего не найдено.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <GameEditDialog
        stationId={selectedStationId}
        productId={editingProductId}
        onOpenChange={(open) => !open && setEditingProductId('')}
      />
      <AddGameDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        stationId={selectedStationId}
        stationName={selectedStation?.name}
        products={productsQuery.data ?? []}
      />
      <GameCopyDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        source={selectedStation}
        stations={stations}
      />
    </div>
  );
}

function AddGameDialog({
  open,
  onOpenChange,
  stationId,
  stationName,
  products,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  stationId: string;
  stationName?: string;
  products: GameSummary[];
}) {
  const { api, mode } = useMerchant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
      setAddedIds([]);
      setError('');
      setSuccess('');
    }
  }, [open]);

  const catalogQuery = useQuery({
    queryKey: ['catalog', mode],
    queryFn: () => api.getCatalog(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const existingIds = useMemo(
    () => new Set([...products.map((item) => item.productId), ...addedIds]),
    [products, addedIds],
  );
  const candidates = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru');
    return (catalogQuery.data ?? [])
      .filter((item) => !existingIds.has(item.productId))
      .filter((item) => {
        const title =
          `${item.displayName ?? ''} ${item.title}`.toLocaleLowerCase('ru');
        return !needle || title.includes(needle);
      })
      .sort((left, right) =>
        productTitle(left).localeCompare(productTitle(right), 'ru'),
      )
      .slice(0, 100);
  }, [catalogQuery.data, existingIds, search]);

  const addMutation = useMutation({
    retry: 0,
    mutationFn: async (product: CatalogProduct) => {
      await api.addProduct(stationId, product.productId);
      const readback = await api.getProduct(stationId, product.productId);
      if (readback.productId !== product.productId)
        throw new Error('Drova не подтвердил добавление игры.');
      return { product, readback };
    },
    onMutate: () => {
      setError('');
      setSuccess('');
    },
    onSuccess: async ({ product }) => {
      setAddedIds((current) => [...current, product.productId]);
      setSuccess(`«${productTitle(product)}» добавлена на станцию.`);
      await queryClient.invalidateQueries({
        queryKey: ['products', mode, stationId],
      });
      await queryClient.invalidateQueries({ queryKey: ['stations', mode] });
      await queryClient.invalidateQueries({
        queryKey: ['station-game-counts', mode],
      });
    },
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Не удалось добавить игру.',
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Добавить игру</DialogTitle>
          <DialogDescription>
            {stationName ?? 'Выбранная станция'} · игра добавляется со
            стандартными настройками.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Название игры"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <Check />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {catalogQuery.isPending ? (
            [0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-14 w-full" />
            ))
          ) : catalogQuery.error ? (
            <Alert variant="destructive">
              <AlertDescription>
                Не удалось загрузить каталог Drova.
              </AlertDescription>
            </Alert>
          ) : candidates.length ? (
            candidates.map((product) => {
              const pending =
                addMutation.isPending &&
                addMutation.variables?.productId === product.productId;
              return (
                <div
                  key={product.productId}
                  className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {productTitle(product)}
                    </p>
                    {product.displayName &&
                      product.displayName !== product.title && (
                        <p className="truncate text-xs text-muted-foreground">
                          {product.title}
                        </p>
                      )}
                  </div>
                  <Button
                    size="sm"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate(product)}
                  >
                    {pending ? 'Добавляем…' : 'Добавить'}
                  </Button>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Подходящих игр нет.
            </p>
          )}
        </div>
        {candidates.length === 100 && (
          <p className="text-xs text-muted-foreground">
            Показаны первые 100 результатов — уточните поиск.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={addMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function productTitle(product: CatalogProduct) {
  return product.displayName?.trim() || product.title;
}

function GameEditDialog({
  stationId,
  productId,
  onOpenChange,
}: {
  stationId: string;
  productId: string;
  onOpenChange(open: boolean): void;
}) {
  const { api, mode } = useMerchant();
  const queryClient = useQueryClient();
  const [useDefault, setUseDefault] = useState<Record<OverrideKey, boolean>>({
    gamePath: true,
    workPath: true,
    allowedPaths: true,
    args: true,
  });
  const [saveError, setSaveError] = useState('');
  const form = useForm<GameForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { gamePath: '', workPath: '', allowedPaths: '', args: '' },
  });
  const detailQuery = useQuery({
    queryKey: ['product', mode, stationId, productId],
    queryFn: () => api.getProduct(stationId, productId),
    enabled: Boolean(stationId && productId),
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    const detail = detailQuery.data;
    form.reset({
      gamePath: detail.gamePath ?? '',
      workPath: detail.workPath ?? '',
      allowedPaths: detail.allowedPaths ?? '',
      args: detail.args ?? '',
    });
    setUseDefault({
      gamePath: detail.gamePath === null,
      workPath: detail.workPath === null,
      allowedPaths: detail.allowedPaths === null,
      args: detail.args === null,
    });
    setSaveError('');
  }, [detailQuery.data, form]);

  const save = form.handleSubmit(async (values) => {
    const detail = detailQuery.data;
    if (!detail) return;
    setSaveError('');
    const expected = {
      gamePath: useDefault.gamePath ? null : values.gamePath,
      workPath: useDefault.workPath ? null : values.workPath,
      allowedPaths: useDefault.allowedPaths ? null : values.allowedPaths,
      args: useDefault.args ? null : values.args,
    };
    try {
      await api.updateProduct(stationId, {
        productId: detail.productId,
        verified: detail.verified,
        enabled: detail.enabled,
        ...expected,
      });
      const readback = await api.getProduct(stationId, detail.productId);
      if (fieldMeta.some(({ key }) => readback[key] !== expected[key]))
        throw new Error('Drova не подтвердил сохранённые настройки.');
      queryClient.setQueryData(
        ['product', mode, stationId, productId],
        readback,
      );
      await queryClient.invalidateQueries({
        queryKey: ['products', mode, stationId],
      });
      onOpenChange(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить настройки.',
      );
    }
  });

  return (
    <Dialog open={Boolean(productId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {detailQuery.data?.title ?? 'Настройки игры'}
          </DialogTitle>
          <DialogDescription>
            Пустой override со включённым стандартным значением отправляется как
            null.
          </DialogDescription>
        </DialogHeader>
        {detailQuery.isPending ? (
          <div className="space-y-4">
            {fieldMeta.map((field) => (
              <Skeleton key={field.key} className="h-20 w-full" />
            ))}
          </div>
        ) : detailQuery.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : 'Не удалось загрузить настройки.'}
            </AlertDescription>
          </Alert>
        ) : (
          detailQuery.data && (
            <div className="space-y-5">
              {fieldMeta.map(({ key, defaultKey, label, multiline }) => {
                const registration = form.register(key, {
                  onChange: () =>
                    setUseDefault((current) => ({ ...current, [key]: false })),
                });
                const defaultValue = detailQuery.data?.[defaultKey];
                const common = {
                  id: `game-${key}`,
                  className: 'font-mono text-xs',
                  ...registration,
                };
                return (
                  <div key={key} className="rounded-xl border p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Label htmlFor={`game-${key}`}>{label}</Label>
                      <Button
                        type="button"
                        variant={useDefault[key] ? 'secondary' : 'ghost'}
                        size="xs"
                        onClick={() => {
                          form.setValue(key, '');
                          setUseDefault((current) => ({
                            ...current,
                            [key]: true,
                          }));
                        }}
                      >
                        <RotateCcw />
                        Стандартное
                      </Button>
                    </div>
                    {multiline ? (
                      <Textarea
                        {...common}
                        className="min-h-20 font-mono text-xs"
                      />
                    ) : (
                      <Input {...common} />
                    )}
                    <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs">
                      <span className="font-medium text-foreground">
                        По умолчанию:{' '}
                      </span>
                      <code className="break-all text-muted-foreground">
                        {String(defaultValue ?? 'пусто')}
                      </code>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={form.formState.isSubmitting || !detailQuery.data}
            onClick={() => void save()}
          >
            {form.formState.isSubmitting ? 'Сохраняем…' : 'Сохранить настройки'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GameCopyDialog({
  open,
  onOpenChange,
  source,
  stations,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  source?: Station;
  stations: Station[];
}) {
  const { api, mode } = useMerchant();
  const queryClient = useQueryClient();
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<GameSyncPlan | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (!open) {
      setTargetIds([]);
      setPlan(null);
      setProgress(null);
      setError('');
      setResult('');
    }
  }, [open]);

  const targets = stations.filter((station) => station.uuid !== source?.uuid);
  const prepare = async () => {
    if (!source || !targetIds.length) return;
    setError('');
    setPlan(null);
    setProgress({ completed: 0, total: 1, label: 'Собираем списки игр' });
    try {
      const nextPlan = await buildGameSyncPlan(
        api,
        source.uuid,
        targets
          .filter((station) => targetIds.includes(station.uuid))
          .map((station) => ({ id: station.uuid, name: station.name })),
        setProgress,
      );
      setPlan(nextPlan);
      setProgress(null);
    } catch (caught) {
      setProgress(null);
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось подготовить сравнение.',
      );
    }
  };
  const execute = async () => {
    if (!plan) return;
    setError('');
    setResult('');
    setProgress({ completed: 0, total: 1, label: 'Начинаем синхронизацию' });
    try {
      const completed = await executeGameSyncPlan(api, plan, setProgress);
      setResult(
        `Готово: ${completed.length} ${completed.length === 1 ? 'станция обновлена' : 'станции обновлены'}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['products', mode] });
      await queryClient.invalidateQueries({ queryKey: ['stations', mode] });
      await queryClient.invalidateQueries({
        queryKey: ['station-game-counts', mode],
      });
      setProgress(null);
    } catch (caught) {
      setProgress(null);
      setError(
        caught instanceof Error ? caught.message : 'Синхронизация остановлена.',
      );
    }
  };
  const counts = plan ? syncPlanCounts(plan) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Скопировать список игр</DialogTitle>
          <DialogDescription>
            Источник: {source?.name}. Лишние игры на целевых станциях будут
            отключены, но не удалены.
          </DialogDescription>
        </DialogHeader>
        {!plan && !result && (
          <div className="space-y-2">
            {targets.map((station) => (
              <label
                key={station.uuid}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-muted/50"
              >
                <Checkbox
                  checked={targetIds.includes(station.uuid)}
                  onCheckedChange={(checked) =>
                    setTargetIds((current) =>
                      checked
                        ? [...current, station.uuid]
                        : current.filter((id) => id !== station.uuid),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {station.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Точный состав будет прочитан для diff
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {progress && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{progress.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(
                  progress.total
                    ? (progress.completed / progress.total) * 100
                    : 0,
                )}
                %
              </span>
            </div>
            <Progress
              value={
                progress.total ? (progress.completed / progress.total) * 100 : 0
              }
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Не закрывайте окно до завершения текущего этапа.
            </p>
          </div>
        )}
        {plan && counts && !result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CountCard value={counts.add} label="Добавить" />
              <CountCard value={counts.update} label="Настройки" />
              <CountCard value={counts.toggle} label="Сменить статус" />
              <CountCard value={counts.disable} label="Отключить лишние" />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Количество берётся из полного списка игр, а не из сокращённого{' '}
              <code>product_list</code> станции. Одна игра может одновременно
              попасть в «Настройки» и «Сменить статус».
            </p>
            {plan.targets.map((target) => (
              <TargetDiff key={target.stationId} target={target} />
            ))}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Операция не завершена</AlertTitle>
            <AlertDescription>
              {error} Автоматического повтора не будет.
            </AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert>
            <Check />
            <AlertTitle>Синхронизация завершена</AlertTitle>
            <AlertDescription>
              {result} Состояние проверено повторным чтением.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={Boolean(progress)}
            onClick={() => onOpenChange(false)}
          >
            {result ? 'Закрыть' : 'Отмена'}
          </Button>
          {!plan && !result && (
            <Button
              disabled={!targetIds.length || Boolean(progress)}
              onClick={() => void prepare()}
            >
              Собрать и показать diff
            </Button>
          )}
          {plan && !result && (
            <Button disabled={Boolean(progress)} onClick={() => void execute()}>
              Подтвердить и применить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const overrideLabels: Record<SyncOverrideKey, string> = {
  gamePath: 'Путь к игре',
  workPath: 'Рабочая папка',
  allowedPaths: 'Разрешённые пути',
  args: 'Параметры запуска',
};

function TargetDiff({ target }: { target: GameSyncTargetPlan }) {
  const additions = target.upserts.filter((item) => item.kind === 'add');
  const updates = target.upserts.filter((item) => item.kind === 'update');
  const statusChanges = [
    ...target.upserts.flatMap((item) =>
      item.statusChange
        ? [
            {
              productId: item.update.productId,
              title: item.title,
              before: item.statusChange.before,
              after: item.statusChange.after,
            },
          ]
        : [],
    ),
    ...target.toggles.map((item) => ({
      productId: item.productId,
      title: item.title,
      before: item.previousEnabled,
      after: item.enabled,
    })),
  ];
  const operationCount =
    additions.length +
    updates.length +
    target.toggles.length +
    target.disable.length;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-2 border-b bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-medium">{target.stationName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Источник: {target.sourceProductCount} · Сейчас на станции:{' '}
            {target.targetProductCount}
          </p>
        </div>
        <Badge variant={operationCount ? 'secondary' : 'outline'}>
          {operationCount
            ? `${operationCount} игр затронуто`
            : 'Уже синхронизировано'}
        </Badge>
      </div>
      <div className="grid gap-px bg-border lg:grid-cols-2">
        <DiffGroup
          icon={<Plus />}
          title="Будут добавлены"
          count={additions.length}
          empty="Новых игр нет"
        >
          {additions.map((item) => (
            <DiffGameRow
              key={item.update.productId}
              title={item.title}
              note={`${item.update.enabled ? 'Добавить включённой' : 'Добавить выключенной'} · ${item.settingsChanges.length ? `скопировать свои настройки: ${item.settingsChanges.map((change) => overrideLabels[change.key]).join(', ')}` : 'стандартные настройки'}`}
            />
          ))}
        </DiffGroup>
        <DiffGroup
          icon={<Settings2 />}
          title="Изменятся настройки"
          count={updates.length}
          empty="Настройки совпадают"
        >
          {updates.map((item) => (
            <div
              key={item.update.productId}
              className="rounded-lg border bg-background px-3 py-2.5"
            >
              <p className="text-sm font-medium">{item.title}</p>
              <div className="mt-2 space-y-1.5">
                {item.settingsChanges.map((change) => (
                  <div key={change.key} className="text-xs">
                    <span className="font-medium text-foreground">
                      {overrideLabels[change.key]}:
                    </span>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <code className="max-w-[44%] truncate">
                        {formatOverride(change.before)}
                      </code>
                      <ArrowRight className="size-3 shrink-0" />
                      <code className="max-w-[44%] truncate text-foreground">
                        {formatOverride(change.after)}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </DiffGroup>
        <DiffGroup
          icon={<Power />}
          title="Поменяется статус"
          count={statusChanges.length}
          empty="Статусы совпадают"
        >
          {statusChanges.map((item) => (
            <DiffGameRow
              key={item.productId}
              title={item.title}
              note={`${enabledLabel(item.before)} → ${enabledLabel(item.after)}`}
            />
          ))}
        </DiffGroup>
        <DiffGroup
          icon={<PowerOff />}
          title="Будут отключены как лишние"
          count={target.disable.length}
          empty="Лишних включённых игр нет"
        >
          {target.disable.map((item) => (
            <DiffGameRow
              key={item.productId}
              title={item.title}
              note="Игра останется на станции, enabled станет false"
            />
          ))}
        </DiffGroup>
      </div>
    </div>
  );
}

function DiffGroup({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="text-primary [&_svg]:size-4">{icon}</span>
        <span>{title}</span>
        <Badge variant="outline" className="ml-auto">
          {count}
        </Badge>
      </div>
      {count ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function DiffGameRow({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="truncate text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function formatOverride(value: string | null) {
  return value === null ? 'Стандартное (null)' : value || 'Пустая строка';
}

function enabledLabel(value: boolean) {
  return value ? 'Включена' : 'Выключена';
}

function GamesSkeleton() {
  return (
    <div className="mt-7 space-y-3 rounded-2xl border bg-card p-5">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-5">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      ))}
    </div>
  );
}
