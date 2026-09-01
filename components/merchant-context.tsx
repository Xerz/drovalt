'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { assertMerchantRole, createLiveApi } from '@/lib/drova/client';
import { createDemoApi } from '@/lib/drova/demo';
import type { Account, DrovaApi } from '@/lib/drova/types';

export const TOKEN_STORAGE_KEY = 'drovalt.merchantToken.v1';
const MODE_STORAGE_KEY = 'drovalt.mode.v1';
const THEME_STORAGE_KEY = 'drovalt.theme.v1';

export type AppMode = 'demo' | 'live';
export type Theme = 'light' | 'dark';

type MerchantContextValue = {
  mode: AppMode;
  theme: Theme;
  api: DrovaApi;
  account?: Account;
  accountError?: Error;
  accountLoading: boolean;
  hasStoredToken: boolean;
  settingsOpen: boolean;
  setSettingsOpen(value: boolean): void;
  connect(token: string): Promise<void>;
  clearToken(): void;
  useDemo(): void;
  useLive(): void;
  toggleTheme(): void;
};

const MerchantContext = createContext<MerchantContextValue | null>(null);

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const demoApi = useRef(createDemoApi());
  const [mode, setMode] = useState<AppMode>('demo');
  const [theme, setTheme] = useState<Theme>('light');
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    setToken(storedToken);
    setMode(storedMode === 'live' && storedToken ? 'live' : 'demo');
    setTheme(storedTheme === 'dark' ? 'dark' : 'light');
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const api = useMemo(
    () => mode === 'live' && token ? createLiveApi(token) : demoApi.current,
    [mode, token],
  );

  useEffect(() => {
    if (ready) queryClient.clear();
  }, [api, queryClient, ready]);

  const accountQuery = useQuery({
    queryKey: ['account', mode],
    queryFn: async () => {
      const account = await api.getAccount();
      assertMerchantRole(account);
      return account;
    },
    enabled: ready && (mode === 'demo' || Boolean(token)),
  });

  const connect = useCallback(async (nextToken: string) => {
    const candidate = nextToken.trim();
    if (!candidate) throw new Error('Вставьте merchant token.');
    const candidateApi = createLiveApi(candidate);
    const account = await candidateApi.getAccount();
    assertMerchantRole(account);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, candidate);
    window.localStorage.setItem(MODE_STORAGE_KEY, 'live');
    setToken(candidate);
    setMode('live');
    queryClient.clear();
    queryClient.setQueryData(['account', 'live'], account);
  }, [queryClient]);

  const clearToken = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.setItem(MODE_STORAGE_KEY, 'demo');
    setToken('');
    setMode('demo');
    queryClient.clear();
  }, [queryClient]);

  const useDemo = useCallback(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, 'demo');
    setMode('demo');
    queryClient.clear();
  }, [queryClient]);

  const useLive = useCallback(() => {
    if (!token) {
      setSettingsOpen(true);
      return;
    }
    window.localStorage.setItem(MODE_STORAGE_KEY, 'live');
    setMode('live');
    queryClient.clear();
  }, [queryClient, token]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<MerchantContextValue>(() => ({
    mode,
    theme,
    api,
    account: accountQuery.data,
    accountError: accountQuery.error instanceof Error ? accountQuery.error : undefined,
    accountLoading: accountQuery.isPending,
    hasStoredToken: Boolean(token),
    settingsOpen,
    setSettingsOpen,
    connect,
    clearToken,
    useDemo,
    useLive,
    toggleTheme,
  }), [mode, theme, api, accountQuery.data, accountQuery.error, accountQuery.isPending, token, settingsOpen, connect, clearToken, useDemo, useLive, toggleTheme]);

  return <MerchantContext.Provider value={value}>{children}</MerchantContext.Provider>;
}

export function useMerchant() {
  const context = useContext(MerchantContext);
  if (!context) throw new Error('useMerchant must be used inside MerchantProvider.');
  return context;
}
