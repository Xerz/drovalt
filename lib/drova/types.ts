import { z } from 'zod';

export const accountSchema = z.object({
  uuid: z.string(),
  roles: z.array(z.string()),
  balance: z.number().nullable().default(0),
  exportable_money: z.number().nullable().default(0),
  trial_msecs_left: z.number().nullable().optional(),
});

export const stationSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable().default(''),
  created_on: z.number().optional(),
  last_heartbeat: z.number().nullable().optional(),
  published: z.boolean(),
  allow_desktop: z.boolean(),
  disable_updates: z.boolean(),
  state: z.string().nullable().optional(),
  product_list: z.array(z.string()).default([]),
});

export const gameSummarySchema = z.object({
  productId: z.string(),
  title: z.string(),
  published: z.boolean(),
  enabled: z.boolean(),
  verified: z.number(),
  available: z.boolean(),
  useDefaultDesktop: z.boolean().optional().default(false),
  needVpn: z.boolean().optional().default(false),
});

const nullableText = z.string().nullable();

export const gameDetailSchema = z.object({
  productId: z.string(),
  title: z.string(),
  published: z.boolean(),
  defaultGamePath: nullableText,
  defaultWorkPath: nullableText,
  defaultAllowedPaths: nullableText,
  defaultArgs: nullableText,
  gamePath: nullableText,
  workPath: nullableText,
  allowedPaths: nullableText,
  args: nullableText,
  enabled: z.boolean(),
  verified: z.number(),
  available: z.boolean(),
});

export const usageStatSchema = z.object({
  sessionCount: z.number(),
  totalIncome: z.number(),
  totalMsecs: z.number(),
});

export const usageServerStatSchema = z.object({
  totalStat: usageStatSchema,
  perGameStats: z.record(z.string(), usageStatSchema).default({}),
});

export const usagePeriodSchema = z.object({
  totalStat: usageStatSchema,
  perServerStats: z.record(z.string(), usageServerStatSchema).default({}),
  perGameStats: z.record(z.string(), usageStatSchema).default({}),
});

export const usageSchema = z.object({
  todayStat: usagePeriodSchema,
  weekStat: usagePeriodSchema,
  monthStat: usagePeriodSchema,
});

export const unpaidStatsSchema = z.object({
  trial_msecs_left: z.number().nullable().optional(),
});

export const prepaidStatsSchema = z.object({
  allowed_to_sell_minutes: z.number(),
  sold_minutes: z.number(),
  used_minutes: z.number(),
  balance: z.number().nullable().optional(),
});

export type Account = z.infer<typeof accountSchema>;
export type Station = z.infer<typeof stationSchema>;
export type GameSummary = z.infer<typeof gameSummarySchema>;
export type GameDetail = z.infer<typeof gameDetailSchema>;
export type UsageStat = z.infer<typeof usageStatSchema>;
export type UsagePeriod = z.infer<typeof usagePeriodSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type UnpaidStats = z.infer<typeof unpaidStatsSchema>;
export type PrepaidStats = z.infer<typeof prepaidStatsSchema>;

export type StationFlag = 'published' | 'allow_desktop' | 'disable_updates';

export type ProductOverrides = Pick<GameDetail, 'gamePath' | 'workPath' | 'allowedPaths' | 'args'>;

export type ProductUpdate = ProductOverrides & {
  productId: string;
  verified: number;
  enabled: boolean;
};

export interface DrovaApi {
  getAccount(): Promise<Account>;
  getStations(merchantId: string): Promise<Station[]>;
  getStation(serverId: string, merchantId: string): Promise<Station>;
  setStationFlag(serverId: string, flag: StationFlag, target: boolean): Promise<void>;
  updateStation(serverId: string, name: string, description: string): Promise<void>;
  getProducts(serverId: string): Promise<GameSummary[]>;
  getProduct(serverId: string, productId: string): Promise<GameDetail>;
  updateProduct(serverId: string, update: ProductUpdate): Promise<void>;
  setProductEnabled(serverId: string, productId: string, target: boolean): Promise<void>;
  getUsage(): Promise<Usage>;
  getUnpaidStats(merchantId: string): Promise<UnpaidStats>;
}
