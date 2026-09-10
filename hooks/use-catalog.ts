'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

import { useMerchant } from '@/components/merchant-context';
import type { DrovaApi } from '@/lib/drova/types';

export function catalogQueryOptions(api: DrovaApi, mode: string) {
  return queryOptions({
    queryKey: ['catalog', mode],
    queryFn: () => api.getCatalog(),
    staleTime: 5 * 60_000,
  });
}

export function useCatalog(enabled = true) {
  const { api, account, mode } = useMerchant();
  return useQuery({
    ...catalogQueryOptions(api, mode),
    enabled: Boolean(account) && enabled,
  });
}
