import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoIpLookup, loadGeoIp } from '@/lib/drova/geoip';
import { buildSessionCsv } from '@/lib/drova/session-csv';
import {
  dedupeSessions,
  fetchSessionDataset,
  loadMerchantSessionHistory,
  MERCHANT_SESSION_EXPANDED_LIMIT,
  MERCHANT_SESSION_INITIAL_LIMIT,
  mergeSessionDataset,
  sessionKey,
  type SessionDataset,
} from '@/lib/drova/sessions';
import {
  merchantSessionListSchema,
  type DrovaApi,
  type MerchantSession,
} from '@/lib/drova/types';

describe('session data', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses finished, active and aborted response rows', () => {
    const value = merchantSessionListSchema.parse({
      sessions: [
        session('finished', 10, 20, 'FINISHED'),
        session('active', 30, null, 'ACTIVE'),
        {
          ...session('aborted', 40, 45, 'ABORTED'),
          abort_comment: 'Stopped',
          score: '12',
          score_text: 'Short',
        },
      ],
    });
    expect(value.sessions).toHaveLength(3);
    expect(value.sessions[1].finished_on).toBeNull();
    expect(value.sessions[2]).toMatchObject({ status: 'ABORTED', score: '12' });
  });

  it('deduplicates by uuid and uses the stable tuple as fallback', () => {
    const first = session('same', 10, 20);
    const fallback = { ...session('', 30, 40), uuid: undefined };
    expect(
      dedupeSessions([first, first, fallback, { ...fallback }]),
    ).toHaveLength(2);
    expect(sessionKey(fallback)).toContain('client-1');
  });

  it('loads only merchant-owned sessions through the accounting endpoint contract', async () => {
    const calls: Array<{ merchantId: string; limit?: number }> = [];
    const api = {
      async getMerchantSessions(
        merchantId: string,
        { limit }: { limit?: number } = {},
      ) {
        calls.push({ merchantId, limit });
        return [session('merchant-row', 1, 2)];
      },
      async getServerNames() {
        return {};
      },
      async getCatalog() {
        return [];
      },
    } as unknown as DrovaApi;
    const initial = await fetchSessionDataset(api, 'merchant-42');
    const expanded = await loadMerchantSessionHistory(api, 'merchant-42');
    expect(initial.sessions).toHaveLength(1);
    expect(expanded).toHaveLength(1);
    expect(calls).toEqual([
      { merchantId: 'merchant-42', limit: MERCHANT_SESSION_INITIAL_LIMIT },
      { merchantId: 'merchant-42', limit: MERCHANT_SESSION_EXPANDED_LIMIT },
    ]);
  });

  it('merges partial results without losing the successful server markers', () => {
    const dataset: SessionDataset = {
      sessions: [session('a', 1, 2)],
      serverNames: {},
      catalog: [],
      updatedAt: 1,
      loadedLimit: MERCHANT_SESSION_INITIAL_LIMIT,
    };
    const merged = mergeSessionDataset(
      dataset,
      [session('b', 3, 4)],
      MERCHANT_SESSION_EXPANDED_LIMIT,
    );
    expect(merged.sessions).toHaveLength(2);
    expect(merged.loadedLimit).toBe(MERCHANT_SESSION_EXPANDED_LIMIT);
  });

  it('exports only the provided visible fields and filtered rows', () => {
    const csv = buildSessionCsv(
      ['Client ID', 'Игра'],
      [['client-1', 'Game "One"']],
    );
    expect(csv).toContain('"Client ID","Игра"');
    expect(csv).toContain('"client-1","Game ""One"""');
    expect(csv).not.toContain('creator_ip');
  });
});

describe('GeoIP privacy boundary', () => {
  it('caches local lookups and never performs a network lookup for an IP', () => {
    const cityReader = {
      get: vi.fn(() => ({
        city: { names: { en: 'Yekaterinburg', ru: 'Екатеринбург' } },
      })),
    };
    const asnReader = {
      get: vi.fn(() => ({ autonomous_system_organization: 'Example ISP' })),
    };
    const lookup = new GeoIpLookup(cityReader as never, asnReader as never);
    expect(lookup.lookup('203.0.113.10')).toEqual({
      city: 'Екатеринбург',
      isp: 'Example ISP',
    });
    expect(lookup.lookup('203.0.113.10')).toEqual({
      city: 'Екатеринбург',
      isp: 'Example ISP',
    });
    expect(cityReader.get).toHaveBeenCalledOnce();
    expect(asnReader.get).toHaveBeenCalledOnce();
  });

  it('downloads only the two configured databases', async () => {
    const requested: string[] = [];
    const fetcher = vi.fn(async (value: string | URL | Request) => {
      requested.push(
        typeof value === 'string'
          ? value
          : value instanceof URL
            ? value.href
            : value.url,
      );
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as typeof fetch;
    const result = await loadGeoIp(fetcher);
    expect(requested).toHaveLength(2);
    expect(requested.every((url) => url.includes('GeoLite2-'))).toBe(true);
    expect(result.cityAvailable).toBe(false);
    expect(result.asnAvailable).toBe(false);
  });
});

function session(
  id: string,
  created: number,
  finished: number | null,
  status = 'FINISHED',
): MerchantSession {
  return {
    uuid: id || undefined,
    client_id: 'client-1',
    server_id: 'server-1',
    product_id: 'game-1',
    status,
    created_on: created,
    finished_on: finished,
    creator_ip: '203.0.113.10',
    billing_type: 'prepaid',
  };
}
