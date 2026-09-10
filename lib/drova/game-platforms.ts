import type { CatalogProduct, GameSummary } from './types';

export const ALL_PLATFORMS = '__all__';
export const UNKNOWN_PLATFORM = '__unknown__';
export type GameFilter = 'all' | 'enabled' | 'disabled';

export function gamePlatformMap(catalog: CatalogProduct[]) {
  return new Map(
    catalog.map((product) => [
      product.productId,
      product.requiredAccount?.trim() || UNKNOWN_PLATFORM,
    ]),
  );
}

export function platformLabel(platform: string) {
  if (platform === UNKNOWN_PLATFORM) return 'Не указана';
  if (platform === 'None') return 'Без аккаунта';
  return platform;
}

export function stationPlatforms(
  products: GameSummary[],
  platforms: Map<string, string>,
) {
  return [
    ...new Set(
      products.map((game) => platforms.get(game.productId) ?? UNKNOWN_PLATFORM),
    ),
  ].sort((a, b) => platformLabel(a).localeCompare(platformLabel(b), 'ru'));
}

export function filterGames(
  products: GameSummary[],
  platforms: Map<string, string>,
  search: string,
  state: GameFilter,
  platform: string,
) {
  const needle = search.trim().toLocaleLowerCase('ru');
  return products.filter(
    (game) =>
      game.title.toLocaleLowerCase('ru').includes(needle) &&
      (state === 'all' || game.enabled === (state === 'enabled')) &&
      (platform === ALL_PLATFORMS ||
        (platforms.get(game.productId) ?? UNKNOWN_PLATFORM) === platform),
  );
}
