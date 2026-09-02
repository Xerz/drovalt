import type { AsnResponse, CityResponse } from 'mmdb-lib';

export const GEOLITE_CITY_URL =
  'https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-City.mmdb';
export const GEOLITE_ASN_URL =
  'https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-ASN.mmdb';

export type GeoIpResult = { city: string; isp: string };
type ReaderLike<T> = { get(ip: string): T | null };

let sharedGeoIp: ReturnType<typeof loadGeoIp> | null = null;

export class GeoIpLookup {
  private readonly cache = new Map<string, GeoIpResult>();

  constructor(
    private readonly cityReader: ReaderLike<CityResponse> | null,
    private readonly asnReader: ReaderLike<AsnResponse> | null,
  ) {}

  lookup(ip: string): GeoIpResult {
    const key = ip.trim();
    if (!key) return { city: '', isp: '' };
    const cached = this.cache.get(key);
    if (cached) return cached;
    let city = '';
    let isp = '';
    try {
      const record = this.cityReader?.get(key);
      const names =
        record?.city?.names ??
        record?.registered_country?.names ??
        record?.country?.names;
      city = names?.ru || names?.en || '';
    } catch {
      city = '';
    }
    try {
      isp = this.asnReader?.get(key)?.autonomous_system_organization || '';
    } catch {
      isp = '';
    }
    const result = { city, isp };
    this.cache.set(key, result);
    return result;
  }
}

export async function loadGeoIp(
  fetcher: typeof fetch = fetch,
): Promise<{
  lookup: GeoIpLookup;
  cityAvailable: boolean;
  asnAvailable: boolean;
}> {
  const [cityResult, asnResult] = await Promise.allSettled([
    loadReader<CityResponse>(GEOLITE_CITY_URL, fetcher),
    loadReader<AsnResponse>(GEOLITE_ASN_URL, fetcher),
  ]);
  const cityReader =
    cityResult.status === 'fulfilled' ? cityResult.value : null;
  const asnReader = asnResult.status === 'fulfilled' ? asnResult.value : null;
  return {
    lookup: new GeoIpLookup(cityReader, asnReader),
    cityAvailable: Boolean(cityReader),
    asnAvailable: Boolean(asnReader),
  };
}

export function getGeoIp() {
  sharedGeoIp ??= loadGeoIp();
  return sharedGeoIp;
}

async function loadReader<T extends CityResponse | AsnResponse>(
  url: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher(url, {
    cache: 'force-cache',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('GeoLite database is unavailable.');
  const { Buffer } = await import('buffer');
  if (!('Buffer' in globalThis)) {
    Object.defineProperty(globalThis, 'Buffer', {
      configurable: true,
      value: Buffer,
    });
  }
  const { Reader } = await import('mmdb-lib');
  return new Reader<T>(Buffer.from(await response.arrayBuffer()));
}
