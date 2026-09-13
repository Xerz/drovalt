'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useMerchant } from '@/components/merchant-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  inspectEacPaths,
  fixEacPaths,
  scanEacPaths,
  type EacFinding,
  type EacOutcome,
} from '@/lib/drova/eac-paths';
import type { DrovaApi, GameDetail, GameSummary } from '@/lib/drova/types';

function useCacheGame(stationId: string) {
  const { mode } = useMerchant();
  const queryClient = useQueryClient();
  return (detail: GameDetail) => {
    queryClient.setQueryData(
      ['product', mode, stationId, detail.productId],
      detail,
    );
    queryClient.setQueryData<GameSummary[]>(
      ['products', mode, stationId],
      (current) =>
        current?.map((item) =>
          item.productId === detail.productId
            ? { ...item, enabled: detail.enabled, verified: detail.verified }
            : item,
        ),
    );
  };
}

export function EacPreview({ finding }: { finding: EacFinding }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium">
        Разрешённые пути ·{' '}
        {finding.source === 'default' ? 'стандартные' : 'пользовательские'}
      </p>
      {finding.after !== null ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Было</p>
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-2">
                {finding.before}
              </pre>
            </div>
            <div>
              <p className="text-muted-foreground">Станет</p>
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-2">
                {finding.after}
              </pre>
            </div>
          </div>
          {finding.source === 'default' && (
            <p>
              Исправленные пути будут сохранены как пользовательская настройка
              этой игры на станции.
            </p>
          )}
          {finding.detail.verified !== 2 && (
            <p>
              Состояние проверки игры неизвестно. Автоматическое исправление
              недоступно.
            </p>
          )}
        </>
      ) : finding.ambiguous ? (
        <>
          <p>
            Неоднозначная запись пути EAC — проверьте её вручную в настройках
            игры.
          </p>
          <pre className="whitespace-pre-wrap break-all">{finding.before}</pre>
        </>
      ) : null}
      {finding.unusedDefault && (
        <p className="text-muted-foreground">
          Старый путь найден в неиспользуемых стандартных путях. Они не
          изменяются: игра использует пользовательскую настройку.
        </p>
      )}
    </div>
  );
}

export function AddedGameEacSuggestion({
  api,
  stationId,
  detail,
  disabled,
  onBusyChange,
  dismissed,
  onDismiss,
}: {
  api: DrovaApi;
  stationId: string;
  detail: GameDetail;
  disabled: boolean;
  onBusyChange(busy: boolean): void;
  dismissed: string;
  onDismiss(fingerprint: string): void;
}) {
  const { mode } = useMerchant();
  const cacheGame = useCacheGame(stationId);
  const query = useQuery({
    queryKey: ['product', mode, stationId, detail.productId],
    queryFn: () => api.getProduct(stationId, detail.productId),
    initialData: detail,
    enabled: false,
    retry: false,
  });
  const finding = inspectEacPaths(query.data);
  const fingerprint = JSON.stringify([
    query.data.allowedPaths,
    query.data.defaultAllowedPaths,
  ]);
  const [savedOutcome, setOutcome] = useState<
    (EacOutcome & { fingerprint: string }) | null
  >(null);
  const outcome =
    savedOutcome?.fingerprint === fingerprint ? savedOutcome : null;
  const [error, setError] = useState('');

  const mutation = useMutation({
    retry: 0,
    mutationFn: async (action: 'fix' | 'refresh') => {
      if (action === 'refresh') {
        cacheGame(await api.getProduct(stationId, detail.productId));
        setOutcome(null);
      } else if (finding) {
        let currentFingerprint = fingerprint;
        await fixEacPaths(
          api,
          stationId,
          [finding],
          (value) => setOutcome({ ...value, fingerprint: currentFingerprint }),
          (readback) => {
            currentFingerprint = JSON.stringify([
              readback.allowedPaths,
              readback.defaultAllowedPaths,
            ]);
            cacheGame(readback);
          },
        );
      }
    },
    onMutate: () => {
      onBusyChange(true);
      setError('');
    },
    onError: () =>
      setError('Не удалось прочитать настройки. Повторите проверку.'),
    onSettled: () => onBusyChange(false),
  });
  if (dismissed === fingerprint || (!finding && !outcome)) return null;
  const needsRefresh =
    outcome?.status === 'error' || outcome?.status === 'skipped';
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      {finding && (
        <>
          <p className="text-sm font-medium">Проверка пути EAC</p>
          <EacPreview finding={finding} />
        </>
      )}
      {outcome && <output className="text-xs">{outcome.message}</output>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {needsRefresh ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || mutation.isPending}
            onClick={() => mutation.mutate('refresh')}
          >
            Проверить снова
          </Button>
        ) : (
          finding &&
          finding.after !== null &&
          finding.detail.verified === 2 && (
            <Button
              size="sm"
              disabled={disabled || mutation.isPending}
              onClick={() => mutation.mutate('fix')}
            >
              {mutation.isPending ? 'Исправляем…' : 'Исправить путь'}
            </Button>
          )
        )}
        {finding && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || mutation.isPending}
            onClick={() => onDismiss(fingerprint)}
          >
            Оставить
          </Button>
        )}
      </div>
    </div>
  );
}

export function EacStationDialog({
  api,
  stationId,
  stationName,
  onClose,
}: {
  api: DrovaApi;
  stationId: string;
  stationName?: string;
  onClose(): void;
}) {
  const { mode } = useMerchant();
  const cacheGame = useCacheGame(stationId);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [selected, setSelected] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<EacOutcome[]>([]);
  const [started, setStarted] = useState(false);
  const scan = useQuery({
    queryKey: ['eac-scan', mode, stationId],
    queryFn: () =>
      scanEacPaths(
        api,
        stationId,
        (completed, total) => setProgress({ completed, total }),
        cacheGame,
      ),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (scan.data)
      setSelected(
        scan.data.findings
          .filter((item) => item.after !== null && item.detail.verified === 2)
          .map((item) => item.detail.productId),
      );
  }, [scan.data, scan.dataUpdatedAt]);
  const mutation = useMutation({
    retry: 0,
    mutationFn: () =>
      fixEacPaths(
        api,
        stationId,
        (scan.data?.findings ?? []).filter((item) =>
          selected.includes(item.detail.productId),
        ),
        (outcome) => setOutcomes((current) => [...current, outcome]),
        cacheGame,
      ),
    onMutate: () => {
      setStarted(true);
      setOutcomes([]);
    },
  });
  const busy = scan.isFetching || mutation.isPending;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Проверка путей EAC</DialogTitle>
          <DialogDescription>
            {stationName ?? 'Выбранная станция'} · все игры станции. Проверяются
            настройки Drova, а не папки на диске.
          </DialogDescription>
        </DialogHeader>
        {scan.isFetching ? (
          <output>
            Проверено {progress.completed} из {progress.total}
          </output>
        ) : scan.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Не удалось загрузить список игр. Повторите проверку.
            </AlertDescription>
          </Alert>
        ) : (
          scan.data && (
            <>
              <p className="text-sm">
                Проверено: {scan.data.total - scan.data.errors.length} из{' '}
                {scan.data.total}. Найдено: {scan.data.findings.length}.
              </p>
              {scan.data.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Проверка неполная. Не удалось прочитать:{' '}
                    {scan.data.errors.map((item) => item.title).join(', ')}.
                  </AlertDescription>
                </Alert>
              )}
              {!scan.data.findings.length && (
                <p>
                  {scan.data.errors.length
                    ? 'В прочитанных настройках старый путь не найден.'
                    : 'Старый путь EAC не найден.'}
                </p>
              )}
              <div className="space-y-3">
                {scan.data.findings.map((finding) => {
                  const productId = finding.detail.productId;
                  const outcome = outcomes.find(
                    (item) => item.productId === productId,
                  );
                  return (
                    <div
                      key={productId}
                      className="space-y-3 rounded-xl border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          aria-label={`Исправить ${finding.detail.title}`}
                          checked={selected.includes(productId)}
                          disabled={
                            started ||
                            busy ||
                            finding.after === null ||
                            finding.detail.verified !== 2
                          }
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...current, productId]
                                : current.filter((id) => id !== productId),
                            )
                          }
                        />
                        <p className="text-sm font-medium">
                          {finding.detail.title}
                        </p>
                      </div>
                      <EacPreview finding={finding} />
                      {outcome && (
                        <output className="text-sm">{outcome.message}</output>
                      )}
                      {started &&
                        !mutation.isPending &&
                        selected.includes(productId) &&
                        !outcome && (
                          <p className="text-xs">
                            Не обработано: операция остановлена.
                          </p>
                        )}
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
        {mutation.isPending && (
          <output>
            Обработано {outcomes.length} из {selected.length}
          </output>
        )}
        {started && !mutation.isPending && (
          <output>
            Исправлено:{' '}
            {outcomes.filter((item) => item.status === 'fixed').length}.
            Пропущено:{' '}
            {outcomes.filter((item) => item.status === 'skipped').length}.
            Ошибок: {outcomes.filter((item) => item.status === 'error').length}.
          </output>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Закрыть
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setStarted(false);
              setOutcomes([]);
              void scan.refetch();
            }}
          >
            Проверить снова
          </Button>
          <Button
            disabled={
              busy || started || Boolean(scan.error) || !selected.length
            }
            onClick={() => mutation.mutate()}
          >
            Исправить выбранные ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
