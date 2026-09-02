import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoIpLookup, loadGeoIp } from '@/lib/drova/geoip';
import { buildSessionCsv } from '@/lib/drova/session-csv';
import {
  dedupeSessions,
  loadSessionHistory,
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
  afterEach(() => vi.useRealTimers());

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

  it('loads station history sequentially with the configured interval and no retry', async () => {
    vi.useFakeTimers();
    const starts: Array<{ id: string; at: number }> = [];
    const api = {
      async getSessions({ serverId }: { serverId?: string } = {}) {
        starts.push({ id: serverId ?? '', at: Date.now() });
        if (serverId === 'b') throw new Error('rate limited');
        return [session(serverId ?? '', starts.length, starts.length + 1)];
      },
    } as DrovaApi;
    const pending = loadSessionHistory(api, ['a', 'b', 'c'], {
      minIntervalMs: 100,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(starts.map((item) => item.id)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(starts.map((item) => item.id)).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(starts.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(starts[1].at - starts[0].at).toBeGreaterThanOrEqual(100);
    expect(result.failedServerIds).toEqual(['b']);
    expect(result.successfulServerIds).toEqual(['a', 'c']);
    expect(starts.filter((item) => item.id === 'b')).toHaveLength(1);
  });

  it('merges partial results without losing the successful server markers', () => {
    const dataset: SessionDataset = {
      sessions: [session('a', 1, 2)],
      serverNames: {},
      catalog: [],
      updatedAt: 1,
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
