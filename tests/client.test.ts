import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertMerchantRole,
  createLiveApi,
  toProductUpdateRequest,
  toStationApiTarget,
  toVerifiedWriteState,
} from '@/lib/drova/client';
import { getStationDisplayStatus } from '@/lib/drova/format';

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
      verified: 'READY',
      enabled: true,
      game_path: null,
      work_path: null,
      allowed_paths: null,
      args: null,
    });
  });

  it('maps only the observed verification state into the write enum', () => {
    expect(toVerifiedWriteState(2)).toBe('READY');
    expect(() => toVerifiedWriteState(1)).toThrow(/неизвестное состояние/i);
  });

  it('distinguishes ready, busy, unverified and offline stations', () => {
    const recent = Date.now() - 10_000;
    expect(getStationDisplayStatus('LISTEN', recent).label).toBe('Готова');
    expect(getStationDisplayStatus('LISTEN', recent, 'ACTIVE').label).toBe(
      'Используется',
    );
    expect(getStationDisplayStatus('BUSY', recent).label).toBe('Используется');
    expect(getStationDisplayStatus('UNVERIFIED', recent).label).toBe(
      'Не проверена',
    );
    expect(getStationDisplayStatus(null, Date.now() - 600_000).label).toBe(
      'Не в сети',
    );
  });

  it('adds a missing product with POST and no request body', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createLiveApi('private-token-value').addProduct(
      'station-demo',
      'product-demo',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://services.drova.io/server-manager/serverproduct/add/station-demo/product-demo',
    );
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  it('loads the public catalog and the latest station session', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (requestUrl(url).includes('/product-manager/product/listfull2')) {
        return new Response(
          JSON.stringify([
            {
              productId: 'game-demo',
              title: 'Demo Game',
              displayName: 'Demo Game',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          sessions: [
            { product_id: 'game-demo', status: 'ACTIVE', created_on: 123 },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = createLiveApi('private-token-value');
    await expect(api.getCatalog()).resolves.toHaveLength(1);
    await expect(api.getLatestSession('station-demo')).resolves.toMatchObject({
      status: 'ACTIVE',
      product_id: 'game-demo',
    });
    expect(requestUrl(fetchMock.mock.calls[0][0])).toContain('limit=2000');
    expect(requestUrl(fetchMock.mock.calls[1][0])).toContain(
      'server_id=station-demo&limit=1',
    );
  });
});

function requestUrl(value: string | URL | Request) {
  if (typeof value === 'string') return value;
  return value instanceof URL ? value.href : value.url;
}
