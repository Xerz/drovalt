import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoIpLookup, loadGeoIp } from '@/lib/drova/geoip';
import { buildSessionCsv } from '@/lib/drova/session-csv';
import {
  dedupeSessions,
  fetchSessionDataset,
  loadSessionHistory,
  SESSION_HISTORY_LIMIT,
  mergeSessionDataset,
  sessionKey,
  type SessionDataset,
} from '@/lib/drova/sessions';
import {
  merchantSessionListSchema,
  merchantSessionResponseSchema,
  type DrovaApi,
  type MerchantSession,
} from '@/lib/drova/types';

describe('session data', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('accepts the list response and optional status used by the bot DTO', () => {
    const value = merchantSessionResponseSchema.parse([
      {
        uuid: 'session-no-status',
        server_id: 'server-a',
        merchant_id: 'merchant-42',
        product_id: 'game-a',
        created_on: 100,
        score_reason: 7,
      },
    ]);
    expect(value).toHaveLength(1);
    expect(value[0].status).toBe('');
    expect(value[0].score_reason).toBe(7);
  });

  it('deduplicates by uuid and uses the stable tuple as fallback', () => {
    const first = session('same', 10, 20);
    const fallback = { ...session('', 30, 40), uuid: undefined };
    expect(
      dedupeSessions([first, first, fallback, { ...fallback }]),
    ).toHaveLength(2);
    expect(sessionKey(fallback)).toContain('client-1');
  });

  it('loads the capped merchant page and discovers all owned stations', async () => {
    const calls: Array<{
      merchantId: string;
      serverId?: string;
      limit?: number;
    }> = [];
    const api = {
      async getSessions(query: {
        merchantId: string;
        serverId?: string;
        limit?: number;
      }) {
        calls.push(query);
        return [
          { ...session('merchant-row', 1, 2), server_id: 'server-a' },
        ];
      },
      async getStations() {
        return [
          { uuid: 'server-a', name: 'A' },
          { uuid: 'server-b', name: 'B' },
        ];
      },
      async getCatalog() {
        return [];
      },
    } as unknown as DrovaApi;
    const initial = await fetchSessionDataset(api, 'merchant-42');
    expect(initial.sessions).toHaveLength(1);
    expect(initial.serverIds).toEqual(['server-a', 'server-b']);
    expect(initial.serverNames).toEqual({ 'server-a': 'A', 'server-b': 'B' });
    expect(calls).toEqual([
      { merchantId: 'merchant-42', limit: SESSION_HISTORY_LIMIT },
    ]);
  });

  it('fans out sequentially with merchant_id, server_id, limit=1000 and no retry', async () => {
    vi.useFakeTimers();
    const starts: Array<{ merchantId: string; serverId?: string; at: number }> = [];
    const api = {
      async getSessions(query: {
        merchantId: string;
        serverId?: string;
        limit?: number;
      }) {
        starts.push({
          merchantId: query.merchantId,
          serverId: query.serverId,
          at: Date.now(),
        });
        if (query.serverId === 'b') throw new Error('rate limited');
        return [session(query.serverId ?? '', starts.length, starts.length + 1)];
      },
    } as unknown as DrovaApi;
    const pending = loadSessionHistory(api, 'merchant-42', ['a', 'b', 'c'], {
      minIntervalMs: 100,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(starts.map((item) => item.serverId)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(starts.map((item) => item.serverId)).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(starts.map((item) => item.serverId)).toEqual(['a', 'b', 'c']);
    expect(starts.every((item) => item.merchantId === 'merchant-42')).toBe(true);
    expect(result.failedServerIds).toEqual(['b']);
    expect(result.successfulServerIds).toEqual(['a', 'c']);
    expect(starts.filter((item) => item.serverId === 'b')).toHaveLength(1);
  });

  it('merges partial results without losing the successful server markers', () => {
    const dataset: SessionDataset = {
      sessions: [session('a', 1, 2)],
      serverNames: {},
      catalog: [],
      updatedAt: 1,
      serverIds: ['server-b'],
      deepLoadedServerIds: [],
    };
    const merged = mergeSessionDataset(
      dataset,
      [session('b', 3, 4)],
      ['server-b'],
    );
    expect(merged.sessions).toHaveLength(2);
    expect(merged.deepLoadedServerIds).toEqual(['server-b']);
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
