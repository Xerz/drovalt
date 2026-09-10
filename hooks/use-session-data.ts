'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useMerchant } from '@/components/merchant-context';
import { fetchSessionDataset } from '@/lib/drova/sessions';
import { catalogQueryOptions } from '@/hooks/use-catalog';

export function sessionDatasetQueryKey(mode: string, accountId?: string) {
  return ['session-dataset', mode, accountId] as const;
}

export function useSessionData() {
  const { api, account, mode } = useMerchant();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: sessionDatasetQueryKey(mode, account?.uuid),
    queryFn: () =>
      fetchSessionDataset(api, account!.uuid, () =>
        queryClient.fetchQuery(catalogQueryOptions(api, mode)),
      ),
    enabled: Boolean(account),
    staleTime: 5 * 60_000,
  });
}
