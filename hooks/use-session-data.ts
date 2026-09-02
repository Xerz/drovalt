'use client';

import { useQuery } from '@tanstack/react-query';

import { useMerchant } from '@/components/merchant-context';
import { fetchSessionDataset } from '@/lib/drova/sessions';

export function sessionDatasetQueryKey(mode: string, accountId?: string) {
  return ['session-dataset', mode, accountId] as const;
}

export function useSessionData() {
  const { api, account, mode } = useMerchant();
  return useQuery({
    queryKey: sessionDatasetQueryKey(mode, account?.uuid),
    queryFn: () => fetchSessionDataset(api),
    enabled: Boolean(account),
    staleTime: 5 * 60_000,
  });
}
