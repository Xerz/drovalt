'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useMerchant } from '@/components/merchant-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const tokenSchema = z.object({ token: z.string().trim().min(8, 'Вставьте merchant token.') });
type TokenForm = z.infer<typeof tokenSchema>;

export function SettingsSheet() {
  const merchant = useMerchant();
  const [submitError, setSubmitError] = useState('');
  const form = useForm<TokenForm>({ resolver: zodResolver(tokenSchema), defaultValues: { token: '' } });

  useEffect(() => {
    if (!merchant.settingsOpen) {
      form.reset({ token: '' });
      setSubmitError('');
    }
  }, [merchant.settingsOpen, form]);

  const submit = form.handleSubmit(async ({ token }) => {
    setSubmitError('');
    try {
      await merchant.connect(token);
      form.reset({ token: '' });
      merchant.setSettingsOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось проверить token.');
    }
  });

  return (
    <Sheet open={merchant.settingsOpen} onOpenChange={merchant.setSettingsOpen}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b px-5 py-5">
          <SheetTitle className="text-lg">Настройки</SheetTitle>
          <SheetDescription>Режим работы, доступ к Drova и внешний вид кабинета.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <section>
            <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Режим работы</Label>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              <Button
                type="button"
                variant={merchant.mode === 'demo' ? 'secondary' : 'ghost'}
                className={merchant.mode === 'demo' ? 'bg-background shadow-sm' : ''}
                onClick={merchant.useDemo}
              >
                Демо
              </Button>
              <Button
                type="button"
                variant={merchant.mode === 'live' ? 'secondary' : 'ghost'}
                className={merchant.mode === 'live' ? 'bg-background shadow-sm' : ''}
                onClick={merchant.useLive}
              >
                Live
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              В демо-режиме изменения симулируются локально. Live отправляет запросы напрямую в Drova.
            </p>
          </section>

          <Separator />

          <section>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">Merchant token</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {merchant.hasStoredToken ? 'Token сохранён на этом устройстве.' : 'Token ещё не добавлен.'}
                </p>
              </div>
              {merchant.hasStoredToken && <ShieldCheck className="size-5 text-primary" />}
            </div>

            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="merchant-token">{merchant.hasStoredToken ? 'Новый token' : 'Token'}</Label>
                <Input
                  id="merchant-token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={merchant.hasStoredToken ? 'Вставьте для замены' : 'Вставьте token из Drova'}
                  aria-invalid={Boolean(form.formState.errors.token)}
                  {...form.register('token')}
                />
                {form.formState.errors.token && <p className="text-xs text-destructive">{form.formState.errors.token.message}</p>}
              </div>
              {submitError && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось подключиться</AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                <KeyRound />
                {form.formState.isSubmitting ? 'Проверяем…' : merchant.hasStoredToken ? 'Проверить и заменить' : 'Проверить и сохранить'}
              </Button>
            </form>

            <Button
              variant="link"
              className="mt-2 h-auto px-0 text-xs"
              nativeButton={false}
              render={<a href="https://drova.io/merchant" target="_blank" rel="noreferrer" />}
            >
              Получить token на drova.io
              <ExternalLink />
            </Button>

            {merchant.hasStoredToken && (
              <Button variant="destructive" className="mt-4 w-full" onClick={merchant.clearToken}>
                <Trash2 />
                Очистить token
              </Button>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold">Хранение и безопасность</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Token остаётся только в localStorage этого origin. Он не добавляется в адрес страницы, отчёты или демо-данные.
            </p>
          </section>
        </div>

        <SheetFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => merchant.setSettingsOpen(false)}>Готово</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
