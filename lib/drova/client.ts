import {
  accountSchema,
  catalogProductSchema,
  gameDetailSchema,
  gameSummarySchema,
  merchantSessionListSchema,
  stationSchema,
  unpaidStatsSchema,
  usageSchema,
  type DrovaApi,
  type ProductUpdate,
  type StationFlag,
} from './types';

const SERVICE_ORIGIN = 'https://services.drova.io';

export class DrovaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DrovaApiError';
  }
}

function errorMessage(status: number) {
  if (status === 401 || status === 403)
    return 'Токен не принят Drova. Замените его в настройках.';
  if (status === 429)
    return 'Drova ограничил частоту запросов. Подождите немного и повторите копирование.';
  if (status >= 500)
    return 'Drova временно не отвечает. Попробуйте обновить данные позже.';
  return `Drova вернул ошибку ${status}.`;
}

export function createLiveApi(token: string): DrovaApi {
  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Auth-Token', token);
    if (init.body !== undefined)
      headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetch(`${SERVICE_ORIGIN}${path}`, {
        ...init,
        headers,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new DrovaApiError(
        'Не удалось связаться с Drova. Проверьте подключение и CORS.',
      );
    }
    if (!response.ok)
      throw new DrovaApiError(errorMessage(response.status), response.status);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async getAccount() {
      return accountSchema.parse(await request('/accounting/myaccount'));
    },
    async getCatalog() {
      return gameSafeArray(
        catalogProductSchema,
        await request('/product-manager/product/listfull2?limit=2000'),
      );
    },
    async getStations(merchantId) {
      const query = new URLSearchParams({ user_id: merchantId });
      return gameSafeArray(
        stationSchema,
        await request(`/server-manager/servers?${query}`),
      );
    },
    async getStation(serverId, merchantId) {
      const query = new URLSearchParams({ user_id: merchantId });
      return stationSchema.parse(
        await request(
          `/server-manager/servers/${encodeURIComponent(serverId)}?${query}`,
        ),
      );
    },
    async getLatestSession(serverId) {
      const query = new URLSearchParams({ server_id: serverId, limit: '1' });
      const result = merchantSessionListSchema.parse(
        await request(`/session-manager/sessions?${query}`),
      );
      return result.sessions[0] ?? null;
    },
    async setStationFlag(serverId, flag, target) {
      const paths: Record<StationFlag, string> = {
        published: 'set_published',
        allow_desktop: 'set_allow_desktop',
        disable_updates: 'set_disable_updates',
      };
      await request(
        `/server-manager/servers/${encodeURIComponent(serverId)}/${paths[flag]}/${target}`,
        {
          method: 'POST',
          body: flag === 'published' ? undefined : '{}',
        },
      );
    },
    async updateStation(serverId, name, description) {
      await request(`/server-manager/servers/${encodeURIComponent(serverId)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
      });
    },
    async getProducts(serverId) {
      return gameSafeArray(
        gameSummarySchema,
        await request(
          `/server-manager/serverproduct/list4edit2/${encodeURIComponent(serverId)}`,
        ),
      );
    },
    async getProduct(serverId, productId) {
      return gameDetailSchema.parse(
        await request(
          `/server-manager/serverproduct/list4edit2/${encodeURIComponent(serverId)}/${encodeURIComponent(productId)}`,
        ),
      );
    },
    async addProduct(serverId, productId) {
      await request(
        `/server-manager/serverproduct/add/${encodeURIComponent(serverId)}/${encodeURIComponent(productId)}`,
        { method: 'POST' },
      );
    },
    async updateProduct(serverId, update) {
      await request('/server-manager/serverproduct/update', {
        method: 'POST',
        body: JSON.stringify(toProductUpdateRequest(serverId, update)),
      });
    },
    async setProductEnabled(serverId, productId, target) {
      await request(
        `/server-manager/serverproduct/set_enabled/${encodeURIComponent(serverId)}/${encodeURIComponent(productId)}/${target}`,
        {
          method: 'POST',
          body: '{}',
        },
      );
    },
    async getUsage() {
      return usageSchema.parse(
        await request('/accounting/statistics/myserverusageprepared'),
      );
    },
    async getUnpaidStats(merchantId) {
      return unpaidStatsSchema.parse(
        await request(
          `/accounting/unpayedstats/${encodeURIComponent(merchantId)}`,
        ),
      );
    },
  };
}

function gameSafeArray<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
): T[] {
  if (!Array.isArray(value))
    throw new DrovaApiError('Drova вернул неожиданный формат данных.');
  return value.map((item) => schema.parse(item));
}

export function assertMerchantRole(account: { roles: string[] }) {
  if (!account.roles.includes('merchant')) {
    throw new DrovaApiError('Этот токен не принадлежит мерчанту Drova.', 403);
  }
}

export const DROVA_SERVICE_ORIGIN = SERVICE_ORIGIN;

export function toProductUpdateRequest(
  serverId: string,
  update: ProductUpdate,
) {
  return {
    server_id: serverId,
    product_id: update.productId,
    verified: toVerifiedWriteState(update.verified),
    enabled: update.enabled,
    game_path: update.gamePath,
    work_path: update.workPath,
    allowed_paths: update.allowedPaths,
    args: update.args,
  };
}

export function toVerifiedWriteState(verified: number) {
  if (verified === 2) return 'READY';
  throw new DrovaApiError(
    'Drova вернул неизвестное состояние проверки игры. Изменение отменено.',
  );
}

export function toStationApiTarget(flag: StationFlag, checked: boolean) {
  return flag === 'disable_updates' ? !checked : checked;
}
