'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  HIDDEN_STATIONS_STORAGE_KEY,
  hiddenStationScope,
  parseHiddenStationPreferences,
} from '@/lib/drova/hidden-stations';

type HiddenState = { ids: string[]; storageError: string };
// Keep local choices across page navigation when browser storage is unavailable.
const memoryPreferences = new Map<string, HiddenState>();
const storageError =
  'Не удалось сохранить скрытые станции в браузере. Скрытие действует до перезагрузки страницы.';

export function useHiddenStations(mode: string, accountId?: string) {
  const scope = accountId ? hiddenStationScope(mode, accountId) : '';
  const [state, setState] = useState<HiddenState & { scope: string }>({
    scope: '',
    ids: [],
    storageError: '',
  });

  useEffect(() => {
    if (!scope) {
      setState({ scope, ids: [], storageError: '' });
      return;
    }
    let next = memoryPreferences.get(scope);
    if (!next?.storageError) {
      try {
        const preferences = parseHiddenStationPreferences(
          window.localStorage.getItem(HIDDEN_STATIONS_STORAGE_KEY),
        );
        next = { ids: preferences[scope] ?? [], storageError: '' };
      } catch {
        next = { ids: next?.ids ?? [], storageError };
      }
    }
    memoryPreferences.set(scope, next);
    setState({ scope, ...next });
  }, [scope]);

  const setHidden = useCallback(
    (stationId: string, hidden: boolean) => {
      if (!scope || state.scope !== scope) return;
      const current = memoryPreferences.get(scope)?.ids ?? [];
      const ids = hidden
        ? [...new Set([...current, stationId])]
        : current.filter((id) => id !== stationId);
      let error = '';
      try {
        const preferences = parseHiddenStationPreferences(
          window.localStorage.getItem(HIDDEN_STATIONS_STORAGE_KEY),
        );
        preferences[scope] = ids;
        window.localStorage.setItem(
          HIDDEN_STATIONS_STORAGE_KEY,
          JSON.stringify(preferences),
        );
      } catch {
        error = storageError;
      }
      const next = { ids, storageError: error };
      memoryPreferences.set(scope, next);
      setState({ scope, ...next });
    },
    [scope, state.scope],
  );

  return {
    hiddenIds: state.scope === scope ? state.ids : [],
    storageError: state.scope === scope ? state.storageError : '',
    ready: state.scope === scope,
    setHidden,
  };
}
