'use client';

import { AlertTriangle, BarChart3, Clock3, Code2, Gamepad2, Menu, MessageCircle, Monitor, Moon, Send, Settings, ShieldCheck, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useMerchant } from '@/components/merchant-context';
import { GamesPage } from '@/components/pages/games-page';
import { SessionsPage } from '@/components/pages/sessions-page';
import { StationsPage } from '@/components/pages/stations-page';
import { StatisticsPage } from '@/components/pages/statistics-page';
import { SettingsSheet } from '@/components/settings-sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

export type AppRoute = 'stations' | 'games' | 'statistics' | 'sessions';

const navigation = [
  { route: 'stations' as const, label: 'Станции', icon: Monitor },
  { route: 'games' as const, label: 'Игры', icon: Gamepad2 },
  { route: 'statistics' as const, label: 'Статистика', icon: BarChart3 },
  { route: 'sessions' as const, label: 'Сессии', icon: Clock3 },
];

declare global {
  interface Window {
    __DROVALT_HASH_ROUTING__?: boolean;
  }
}

function routeFromPathname(pathname: string): AppRoute {
  const value = pathname.split('/').filter(Boolean)[0];
  return navigation.some((item) => item.route === value) ? value as AppRoute : 'stations';
}

function currentBrowserRoute() {
  if (window.__DROVALT_HASH_ROUTING__) {
    return routeFromPathname(window.location.hash.replace(/^#/, ''));
  }
  return routeFromPathname(window.location.pathname);
}

export function MerchantApp({ initialRoute = 'stations' }: { initialRoute?: AppRoute }) {
  const merchant = useMerchant();
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setRoute(currentBrowserRoute());
    const onPopState = () => setRoute(currentBrowserRoute());
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
    };
  }, []);

  const navigate = (next: AppRoute) => {
    if (window.__DROVALT_HASH_ROUTING__) {
      window.location.hash = `/${next}`;
    } else {
      window.history.pushState(
        {},
        '',
        next === 'stations' ? '/stations' : `/${next}`,
      );
    }
    setRoute(next);
    setMobileOpen(false);
  };

  const content = useMemo(() => {
    if (route === 'games') return <GamesPage />;
    if (route === 'statistics') return <StatisticsPage />;
    if (route === 'sessions') return <SessionsPage />;
    return <StationsPage />;
  }, [route]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex lg:flex-col">
        <SidebarContent route={route} navigate={navigate} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[285px] px-4 py-5" showCloseButton={false}>
          <SheetTitle className="sr-only">Меню мерчанта</SheetTitle>
          <SidebarContent route={route} navigate={navigate} />
        </SheetContent>
      </Sheet>

      <section className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/88 px-4 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}>
              <Menu />
            </Button>
            <div>
              <p className="text-sm font-semibold tracking-tight lg:hidden">Drovalt</p>
              <p className="hidden text-xs text-muted-foreground lg:block">Управление инфраструктурой</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <span className={`size-1.5 rounded-full ${merchant.mode === 'live' && merchant.account ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {merchant.mode === 'demo' ? 'Демо' : merchant.account ? 'Live · подключено' : 'Live'}
            </Badge>
            <Button variant="ghost" size="icon-lg" aria-label={merchant.theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} onClick={merchant.toggleTheme}>
              {merchant.theme === 'light' ? <Moon /> : <Sun />}
            </Button>
            <Button variant="outline" size="icon-lg" aria-label="Открыть настройки" onClick={() => merchant.setSettingsOpen(true)}>
              <Settings />
            </Button>
          </div>
        </header>

        {merchant.mode === 'live' && merchant.accountError && (
          <div className="mx-auto max-w-[1500px] px-4 pt-5 md:px-7">
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Live-подключение недоступно</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{merchant.accountError.message}</span>
                <Button variant="outline" size="sm" onClick={() => merchant.setSettingsOpen(true)}>Открыть настройки</Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {content}
      </section>
      <SettingsSheet />
    </main>
  );
}

function SidebarContent({ route, navigate }: { route: AppRoute; navigate(route: AppRoute): void }) {
  const merchant = useMerchant();
  return (
    <>
      <button type="button" className="flex items-center gap-3 px-2 text-left" onClick={() => navigate('stations')}>
        <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]">
          <span className="text-sm font-black tracking-tight">D</span>
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">Drovalt</p>
          <p className="text-xs text-muted-foreground">Кабинет мерчанта</p>
        </div>
      </button>

      <p className="mb-2 mt-10 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Меню мерчанта</p>
      <nav className="space-y-1" aria-label="Меню мерчанта">
        {navigation.map(({ route: itemRoute, label, icon: Icon }) => {
          const active = route === itemRoute;
          return (
            <button
              key={itemRoute}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`}
              onClick={() => navigate(itemRoute)}
            >
              <Icon className={`size-4 ${active ? 'text-primary' : ''}`} />
              {label}
            </button>
          );
        })}
      </nav>

      <Separator className="my-5" />
      <div className="space-y-3 px-3">
        {[
          { label: 'Чат Drova на сайте', href: 'https://drova.io/woody', icon: MessageCircle },
          { label: 'Чат Drova в Telegram', href: 'https://t.me/drovatalk', icon: Send },
        ].map(({ label, href, icon: Icon }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Icon className="size-4 shrink-0" />{label}
          </a>
        ))}
        <p className="text-xs leading-5 text-muted-foreground">Прямое подключение к services.drova.io без промежуточного сервера.</p>
        <a
          href="https://github.com/Xerz/drovalt"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Code2 className="size-4" />
          Исходный код и self-hosting
        </a>
      </div>

      <div className="mt-auto rounded-2xl border border-primary/15 bg-primary/5 p-3.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-primary" />
          {merchant.mode === 'demo' ? 'Демо-режим' : merchant.account ? 'Merchant подтверждён' : 'Проверяем доступ'}
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {merchant.mode === 'demo' ? 'Изменения остаются только в этом окне.' : 'Изменения отправляются в ваш кабинет Drova.'}
        </p>
      </div>
    </>
  );
}
