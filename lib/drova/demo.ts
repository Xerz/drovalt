import {
  type Account,
  type CatalogProduct,
  type DrovaApi,
  type GameDetail,
  type GameSummary,
  type MerchantSession,
  type ProductUpdate,
  type Station,
  type StationFlag,
  type Usage,
} from './types';

const now = Date.now();

const initialAccount: Account = {
  uuid: 'demo-merchant',
  roles: ['client', 'merchant'],
  balance: 18_420.5,
  exportable_money: 12_760,
  trial_msecs_left: 0,
};

const initialStations: Station[] = [
  {
    uuid: 'demo-station-01',
    name: 'Северная · RTX 4080',
    description: '<h3>Стабильная станция для 4K</h3><p>Быстрый NVMe, проводное подключение и свежие драйверы.</p><ul><li>До 120 FPS</li><li>Геймпад поддерживается</li></ul>',
    last_heartbeat: now - 18_000,
    published: true,
    allow_desktop: false,
    disable_updates: false,
    state: 'READY',
    product_list: ['game-01', 'game-02', 'game-03', 'game-04', 'game-05', 'game-06'],
  },
  {
    uuid: 'demo-station-02',
    name: 'Орбита · RTX 4070 Ti',
    description: '<h3>Игровая станция «Орбита»</h3><p>Оптимальный профиль для соревновательных игр.</p>',
    last_heartbeat: now - 112_000,
    published: true,
    allow_desktop: true,
    disable_updates: false,
    state: 'BUSY',
    product_list: ['game-01', 'game-02', 'game-03', 'game-07'],
  },
  {
    uuid: 'demo-station-03',
    name: 'Резервная · RTX 3070',
    description: '<p>Резервный узел. Публикуется после технического обслуживания.</p>',
    last_heartbeat: now - 3 * 3_600_000,
    published: false,
    allow_desktop: false,
    disable_updates: true,
    state: 'OFFLINE',
    product_list: ['game-01', 'game-04', 'game-07', 'game-08'],
  },
];

const catalog = {
  'game-01': ['Cyberpunk 2077', 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe', 'C:\\Games\\Cyberpunk 2077', '', '-launcher-skip'],
  'game-02': ['Dota 2', 'C:\\Program Files (x86)\\Steam\\Steam.exe', 'C:\\Program Files (x86)\\Steam', '', '-applaunch 570'],
  'game-03': ['Baldur’s Gate 3', 'C:\\Games\\Baldurs Gate 3\\bin\\bg3_dx11.exe', 'C:\\Games\\Baldurs Gate 3', '', '--skip-launcher'],
  'game-04': ['Forza Horizon 5', 'C:\\XboxGames\\Forza Horizon 5\\Content\\ForzaHorizon5.exe', 'C:\\XboxGames\\Forza Horizon 5\\Content', '', ''],
  'game-05': ['Hades II', 'C:\\Games\\Hades II\\Ship\\Hades2.exe', 'C:\\Games\\Hades II', '', ''],
  'game-06': ['Marvel Rivals', 'C:\\Program Files (x86)\\Steam\\Steam.exe', 'C:\\Program Files (x86)\\Steam', '', '-applaunch 2767030'],
  'game-07': ['War Thunder', 'C:\\Games\\War Thunder\\launcher.exe', 'C:\\Games\\War Thunder', '', ''],
  'game-08': ['The Witcher 3', 'C:\\Games\\The Witcher 3\\bin\\x64_dx12\\witcher3.exe', 'C:\\Games\\The Witcher 3', '', ''],
} satisfies Record<string, [string, string, string, string, string]>;

function detail(productId: keyof typeof catalog, enabled = true, override = false): GameDetail {
  const [title, gamePath, workPath, allowedPaths, args] = catalog[productId];
  return {
    productId,
    title,
    published: true,
    defaultGamePath: gamePath,
    defaultWorkPath: workPath,
    defaultAllowedPaths: allowedPaths,
    defaultArgs: args,
    gamePath: override ? gamePath.replace('Games', 'DrovaGames') : null,
    workPath: override ? workPath.replace('Games', 'DrovaGames') : null,
    allowedPaths: null,
    args: override ? `${args} -high`.trim() : null,
    enabled,
    verified: 2,
    available: true,
  };
}

const initialProducts: Record<string, GameDetail[]> = {
  'demo-station-01': [detail('game-01', true, true), detail('game-02'), detail('game-03'), detail('game-04'), detail('game-05'), detail('game-06')],
  'demo-station-02': [detail('game-01'), detail('game-02', false), detail('game-03'), detail('game-07')],
  'demo-station-03': [detail('game-01'), detail('game-04', false), detail('game-07'), detail('game-08')],
};

const demoCatalog: CatalogProduct[] = Object.entries(catalog).map(
  ([productId, [title]]) => ({ productId, title, displayName: title }),
);

const demoLatestSessions: Record<string, MerchantSession | null> = {
  'demo-station-01': {
    product_id: 'game-01',
    status: 'FINISHED',
    created_on: now - 28 * 60_000,
    finished_on: now - 12 * 60_000,
  },
  'demo-station-02': {
    product_id: 'game-02',
    status: 'ACTIVE',
    created_on: now - 9 * 60_000,
  },
  'demo-station-03': null,
};

function summary(value: GameDetail): GameSummary {
  return {
    productId: value.productId,
    title: value.title,
    published: value.published,
    enabled: value.enabled,
    verified: value.verified,
    available: value.available,
    useDefaultDesktop: !value.gamePath && !value.workPath && !value.allowedPaths && !value.args,
    needVpn: false,
  };
}

const usage: Usage = {
  todayStat: makePeriod([
    ['demo-station-01', 14, 5_820_000, 2_340],
    ['demo-station-02', 9, 3_240_000, 1_410],
    ['demo-station-03', 1, 540_000, 120],
  ]),
  weekStat: makePeriod([
    ['demo-station-01', 108, 48_240_000, 19_860],
    ['demo-station-02', 76, 31_320_000, 13_240],
    ['demo-station-03', 21, 7_260_000, 3_180],
  ]),
  monthStat: makePeriod([
    ['demo-station-01', 438, 189_420_000, 78_640],
    ['demo-station-02', 312, 121_800_000, 52_710],
    ['demo-station-03', 84, 28_980_000, 12_460],
  ]),
};

function makePeriod(rows: Array<[string, number, number, number]>) {
  const perServerStats = Object.fromEntries(
    rows.map(([id, sessionCount, totalMsecs, totalIncome]) => [
      id,
      {
        totalStat: { sessionCount, totalMsecs, totalIncome },
        perGameStats: {
          'game-01': { sessionCount: Math.ceil(sessionCount * 0.45), totalMsecs: Math.ceil(totalMsecs * 0.5), totalIncome: Math.ceil(totalIncome * 0.48) },
          'game-02': { sessionCount: Math.floor(sessionCount * 0.3), totalMsecs: Math.floor(totalMsecs * 0.28), totalIncome: Math.floor(totalIncome * 0.31) },
        },
      },
    ]),
  );
  return {
    totalStat: rows.reduce(
      (total, [, sessionCount, totalMsecs, totalIncome]) => ({
        sessionCount: total.sessionCount + sessionCount,
        totalMsecs: total.totalMsecs + totalMsecs,
        totalIncome: total.totalIncome + totalIncome,
      }),
      { sessionCount: 0, totalMsecs: 0, totalIncome: 0 },
    ),
    perServerStats,
    perGameStats: {},
  };
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 180));

export function createDemoApi(): DrovaApi {
  let stations = structuredClone(initialStations);
  const products = structuredClone(initialProducts);

  async function pause<T>(value: T): Promise<T> {
    await wait();
    return structuredClone(value);
  }

  return {
    getAccount: () => pause(initialAccount),
    getCatalog: () => pause(demoCatalog),
    getStations: () => pause(stations),
    getStation: async (serverId) => {
      const station = stations.find((item) => item.uuid === serverId);
      if (!station) throw new Error('Станция не найдена.');
      return pause(station);
    },
    getLatestSession: (serverId) => pause(demoLatestSessions[serverId] ?? null),
    setStationFlag: async (serverId: string, flag: StationFlag, target: boolean) => {
      await wait();
      stations = stations.map((station) => station.uuid === serverId ? { ...station, [flag]: target } : station);
    },
    updateStation: async (serverId, name, description) => {
      await wait();
      stations = stations.map((station) => station.uuid === serverId ? { ...station, name, description } : station);
    },
    getProducts: async (serverId) => pause((products[serverId] ?? []).map(summary)),
    getProduct: async (serverId, productId) => {
      const product = products[serverId]?.find((item) => item.productId === productId);
      if (!product) throw new Error('Игра не найдена на станции.');
      return pause(product);
    },
    addProduct: async (serverId, productId) => {
      await wait();
      const list = products[serverId] ?? (products[serverId] = []);
      if (list.some((item) => item.productId === productId)) return;
      const base = Object.values(products)
        .flat()
        .find((item) => item.productId === productId);
      if (!base) throw new Error('Игра отсутствует в демо-каталоге.');
      list.push({
        ...structuredClone(base),
        gamePath: null,
        workPath: null,
        allowedPaths: null,
        args: null,
        enabled: true,
      });
      stations = stations.map((station) => station.uuid === serverId
        ? { ...station, product_list: list.map((item) => item.productId) }
        : station);
    },
    deleteProduct: async (serverId, productId) => {
      await wait();
      const list = products[serverId] ?? [];
      const index = list.findIndex((item) => item.productId === productId);
      if (index < 0) throw new Error('Игра не найдена на станции.');
      list.splice(index, 1);
      stations = stations.map((station) => station.uuid === serverId
        ? { ...station, product_list: list.map((item) => item.productId) }
        : station);
    },
    updateProduct: async (serverId, update: ProductUpdate) => {
      await wait();
      const list = products[serverId] ?? (products[serverId] = []);
      const existing = list.find((item) => item.productId === update.productId);
      if (!existing) throw new Error('Сначала добавьте игру на станцию.');
      Object.assign(existing, update);
    },
    setProductEnabled: async (serverId, productId, target) => {
      await wait();
      const product = products[serverId]?.find((item) => item.productId === productId);
      if (!product) throw new Error('Игра не найдена на станции.');
      product.enabled = target;
    },
    getUsage: () => pause(usage),
    getUnpaidStats: () => pause({ trial_msecs_left: 0 }),
  };
}
