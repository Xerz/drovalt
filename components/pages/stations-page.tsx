'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FilePenLine, RefreshCw, ServerOff, Wifi } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useMerchant } from '@/components/merchant-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatHeartbeat, isStationOnline } from '@/lib/drova/format';
import { toStationApiTarget } from '@/lib/drova/client';
import type { Station, StationFlag } from '@/lib/drova/types';
import { sanitizeDescriptionHtml } from '@/lib/security/sanitize-description';

const descriptionSchema = z.object({ description: z.string().max(12_000, 'Описание слишком длинное.') });
type DescriptionForm = z.infer<typeof descriptionSchema>;

export function StationsPage() {
  const { api, account, mode, setSettingsOpen } = useMerchant();
  const queryClient = useQueryClient();
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [rowError, setRowError] = useState('');

  const stationsQuery = useQuery({
    queryKey: ['stations', mode, account?.uuid],
    queryFn: () => api.getStations(account!.uuid),
    enabled: Boolean(account),
  });

  const flagMutation = useMutation({
    mutationFn: async ({ station, flag, checked }: { station: Station; flag: StationFlag; checked: boolean }) => {
      const apiTarget = toStationApiTarget(flag, checked);
      await api.setStationFlag(station.uuid, flag, apiTarget);
      const readback = await api.getStation(station.uuid, account!.uuid);
      if (readback[flag] !== apiTarget) throw new Error('Drova не подтвердил новое состояние. Показано фактическое значение.');
      return readback;
    },
    onMutate: () => setRowError(''),
    onSuccess: (readback) => {
      queryClient.setQueryData<Station[]>(['stations', mode, account?.uuid], (current = []) => current.map((item) => item.uuid === readback.uuid ? readback : item));
    },
    onError: (error) => {
      setRowError(error instanceof Error ? error.message : 'Не удалось изменить станцию.');
      void stationsQuery.refetch();
    },
  });

  const stations = stationsQuery.data ?? [];
  const onlineCount = stations.filter((station) => isStationOnline(station.state, station.last_heartbeat)).length;
  const pendingId = flagMutation.variables?.station.uuid;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-9">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            {account ? `${onlineCount} из ${stations.length} станций в сети` : 'Подключение не настроено'}
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">Станции</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">Управляйте публикацией, доступом и обновлениями без перехода между страницами.</p>
        </div>
        <Button variant="outline" disabled={!account || stationsQuery.isFetching} onClick={() => void stationsQuery.refetch()}>
          <RefreshCw className={stationsQuery.isFetching ? 'animate-spin' : ''} />
          Обновить данные
        </Button>
      </div>

      {rowError && (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>Изменение не подтверждено</AlertTitle>
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}

      {!account && !stationsQuery.isPending ? (
        <EmptyConnection onOpenSettings={() => setSettingsOpen(true)} />
      ) : stationsQuery.isPending ? (
        <StationsSkeleton />
      ) : stationsQuery.error ? (
        <Alert variant="destructive" className="mt-7">
          <AlertTitle>Не удалось загрузить станции</AlertTitle>
          <AlertDescription>{stationsQuery.error instanceof Error ? stationsQuery.error.message : 'Неизвестная ошибка.'}</AlertDescription>
        </Alert>
      ) : stations.length === 0 ? (
        <div className="mt-7 rounded-2xl border border-dashed p-12 text-center"><ServerOff className="mx-auto size-6 text-muted-foreground" /><h2 className="mt-4 font-semibold">Станций пока нет</h2><p className="mt-1 text-sm text-muted-foreground">Новые станции создаются в официальном кабинете Drova.</p></div>
      ) : (
        <div className="mt-7 overflow-hidden rounded-2xl border bg-card shadow-[0_18px_60px_-44px_rgb(0_0_0/0.45)]">
          <Table>
            <TableHeader className="bg-muted/45">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 pl-5">Станция</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Игры</TableHead>
                <TableHead className="text-center">Публикация</TableHead>
                <TableHead className="text-center">Рабочий стол</TableHead>
                <TableHead className="text-center">Обновления</TableHead>
                <TableHead className="pr-5 text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stations.map((station) => {
                const online = isStationOnline(station.state, station.last_heartbeat);
                const pending = flagMutation.isPending && pendingId === station.uuid;
                return (
                  <TableRow key={station.uuid} className="h-[72px]">
                    <TableCell className="max-w-[320px] pl-5"><p className="truncate font-medium">{station.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{station.uuid}</p></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <div><p className="text-sm">{online ? 'В сети' : 'Не в сети'}</p><p className="text-xs text-muted-foreground">{formatHeartbeat(station.last_heartbeat)}</p></div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{station.product_list.length}</Badge></TableCell>
                    <TableCell className="text-center"><Switch checked={station.published} disabled={pending} aria-label={`Публикация ${station.name}`} onCheckedChange={(checked) => flagMutation.mutate({ station, flag: 'published', checked })} /></TableCell>
                    <TableCell className="text-center"><Switch checked={station.allow_desktop} disabled={pending} aria-label={`Рабочий стол ${station.name}`} onCheckedChange={(checked) => flagMutation.mutate({ station, flag: 'allow_desktop', checked })} /></TableCell>
                    <TableCell className="text-center"><Switch checked={!station.disable_updates} disabled={pending} aria-label={`Автообновления ${station.name}`} onCheckedChange={(checked) => flagMutation.mutate({ station, flag: 'disable_updates', checked })} /></TableCell>
                    <TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" onClick={() => setEditingStation(station)}><FilePenLine />Описание</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DescriptionDialog station={editingStation} onOpenChange={(open) => !open && setEditingStation(null)} />
    </div>
  );
}

function DescriptionDialog({ station, onOpenChange }: { station: Station | null; onOpenChange(open: boolean): void }) {
  const { api, account, mode } = useMerchant();
  const queryClient = useQueryClient();
  const form = useForm<DescriptionForm>({ resolver: zodResolver(descriptionSchema), defaultValues: { description: '' } });
  const [saveError, setSaveError] = useState('');
  const description = form.watch('description');
  const preview = useMemo(() => sanitizeDescriptionHtml(description), [description]);

  useEffect(() => {
    form.reset({ description: station?.description ?? '' });
    setSaveError('');
  }, [station, form]);

  const save = form.handleSubmit(async ({ description: nextDescription }) => {
    if (!station || !account) return;
    setSaveError('');
    try {
      await api.updateStation(station.uuid, station.name, nextDescription);
      const readback = await api.getStation(station.uuid, account.uuid);
      if (readback.description !== nextDescription) throw new Error('Drova не подтвердил сохранённое описание.');
      queryClient.setQueryData<Station[]>(['stations', mode, account.uuid], (current = []) => current.map((item) => item.uuid === readback.uuid ? readback : item));
      onOpenChange(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить описание.');
    }
  });

  return (
    <Dialog open={Boolean(station)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Описание станции</DialogTitle>
          <DialogDescription>{station?.name}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="edit" className="mt-1">
          <TabsList><TabsTrigger value="edit">Редактор</TabsTrigger><TabsTrigger value="preview">Предпросмотр</TabsTrigger></TabsList>
          <TabsContent value="edit" className="mt-3 space-y-2">
            <Label htmlFor="station-description">HTML-описание</Label>
            <Textarea id="station-description" className="min-h-64 font-mono text-xs leading-5" {...form.register('description')} />
            <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Скрипты, формы, стили и небезопасные ссылки удаляются из preview.</p><span className="text-xs tabular-nums text-muted-foreground">{description.length}/12000</span></div>
          </TabsContent>
          <TabsContent value="preview" className="mt-3">
            <div className="description-preview min-h-64 rounded-xl border bg-background p-5" dangerouslySetInnerHTML={{ __html: preview || '<p>Описание пустое.</p>' }} />
          </TabsContent>
        </Tabs>
        {station && <Button variant="link" className="h-auto w-fit px-0" nativeButton={false} render={<a href={`https://drova.io/stations/${encodeURIComponent(station.uuid)}`} target="_blank" rel="noreferrer" />}><ExternalLink />Открыть публичную страницу</Button>}
        {saveError && <Alert variant="destructive"><AlertDescription>{saveError}</AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="button" disabled={form.formState.isSubmitting} onClick={() => void save()}>{form.formState.isSubmitting ? 'Сохраняем…' : 'Сохранить'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyConnection({ onOpenSettings }: { onOpenSettings(): void }) {
  return <div className="mt-7 rounded-2xl border border-dashed p-12 text-center"><Wifi className="mx-auto size-6 text-primary" /><h2 className="mt-4 font-semibold">Подключите merchant token</h2><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Либо переключитесь на демо-режим, чтобы посмотреть интерфейс без запросов в Drova.</p><Button className="mt-5" onClick={onOpenSettings}>Открыть настройки</Button></div>;
}

function StationsSkeleton() {
  return <div className="mt-7 space-y-3 rounded-2xl border bg-card p-5">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-5"><Skeleton className="h-10 flex-1" /><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-44" /></div>)}</div>;
}
