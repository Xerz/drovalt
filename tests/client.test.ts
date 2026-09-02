import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertMerchantRole,
  createLiveApi,
  toProductUpdateRequest,
  toStationApiTarget,
} from '@/lib/drova/client';

describe('Drova client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the token only as X-Auth-Token and validates merchant role', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Auth-Token')).toBe('private-token-value');
      expect(String(_url)).not.toContain('private-token-value');
      return new Response(
        JSON.stringify({
          uuid: 'merchant-1',
          roles: ['merchant'],
          balance: 0,
          exportable_money: 0,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const account = await createLiveApi('private-token-value').getAccount();
    expect(() => assertMerchantRole(account)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not include the token in network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(
      createLiveApi('private-token-value').getAccount(),
    ).rejects.not.toThrow(/private-token-value/);
  });

  it('inverts only the disable_updates control', () => {
    expect(toStationApiTarget('published', true)).toBe(true);
    expect(toStationApiTarget('allow_desktop', false)).toBe(false);
    expect(toStationApiTarget('disable_updates', true)).toBe(false);
  });

  it('serializes the product update exactly like the merchant UI contract', () => {
    expect(
      toProductUpdateRequest('station-demo', {
        productId: 'product-demo',
        verified: 2,
        enabled: true,
        gamePath: null,
        workPath: null,
        allowedPaths: null,
        args: null,
      }),
    ).toEqual({
      server_id: 'station-demo',
      product_id: 'product-demo',
      verified: '2',
      enabled: true,
      game_path: null,
      work_path: null,
      allowed_paths: null,
      args: null,
    });
  });
});
