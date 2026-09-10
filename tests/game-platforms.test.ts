import { describe, expect, it } from 'vitest';

import {
  ALL_PLATFORMS,
  UNKNOWN_PLATFORM,
  filterGames,
  gamePlatformMap,
  platformLabel,
  stationPlatforms,
} from '@/lib/drova/game-platforms';
import { catalogProductSchema, gameSummarySchema } from '@/lib/drova/types';

const products = [
  gameSummarySchema.parse({
    productId: 'a',
    title: 'One',
    published: true,
    enabled: true,
    verified: 2,
    available: true,
  }),
  gameSummarySchema.parse({
    productId: 'b',
    title: 'One sequel',
    published: true,
    enabled: false,
    verified: 2,
    available: true,
  }),
  gameSummarySchema.parse({
    productId: 'c',
    title: 'Steam in title only',
    published: true,
    enabled: true,
    verified: 2,
    available: true,
  }),
  gameSummarySchema.parse({
    productId: 'd',
    title: 'Standalone',
    published: true,
    enabled: true,
    verified: 2,
    available: true,
  }),
];
const catalog = [
  catalogProductSchema.parse({
    productId: 'a',
    title: 'One',
    requiredAccount: 'Steam',
  }),
  catalogProductSchema.parse({
    productId: 'b',
    title: 'One sequel',
    requiredAccount: 'Epic Games',
  }),
  catalogProductSchema.parse({
    productId: 'd',
    title: 'Standalone',
    requiredAccount: 'None',
  }),
  catalogProductSchema.parse({
    productId: 'elsewhere',
    title: 'Other station',
    requiredAccount: 'Ubisoft',
  }),
];
const platforms = gamePlatformMap(catalog);

describe('game platforms', () => {
  it('retains catalog metadata and combines platform, search and state', () => {
    expect(
      filterGames(products, platforms, ' ONE ', 'enabled', 'Steam').map(
        (g) => g.productId,
      ),
    ).toEqual(['a']);
    expect(
      filterGames(products, platforms, 'one', 'disabled', 'Steam'),
    ).toEqual([]);
    expect(
      filterGames(products, platforms, 'one', 'disabled', 'Epic Games').map(
        (g) => g.productId,
      ),
    ).toEqual(['b']);
    expect(
      filterGames(products, platforms, '', 'all', ALL_PLATFORMS),
    ).toHaveLength(4);
  });

  it('uses only station platforms and distinguishes None from missing metadata', () => {
    expect(stationPlatforms(products, platforms)).toEqual(
      expect.arrayContaining(['Steam', 'Epic Games', 'None', UNKNOWN_PLATFORM]),
    );
    expect(stationPlatforms(products, platforms)).not.toContain('Ubisoft');
    expect(platformLabel('None')).toBe('Без аккаунта');
    expect(platformLabel(UNKNOWN_PLATFORM)).toBe('Не указана');
    expect(
      filterGames(products, platforms, '', 'all', UNKNOWN_PLATFORM).map(
        (g) => g.productId,
      ),
    ).toEqual(['c']);
    expect(
      filterGames(products, platforms, '', 'all', 'None').map(
        (g) => g.productId,
      ),
    ).toEqual(['d']);
  });

  it('handles nullable and whitespace metadata without guessing from a title', () => {
    const missing = gamePlatformMap([
      { productId: 'a', title: 'Steam game', requiredAccount: null },
      { productId: 'b', title: 'Epic Games title', requiredAccount: '  ' },
    ]);
    expect([...missing.values()]).toEqual([UNKNOWN_PLATFORM, UNKNOWN_PLATFORM]);
  });
});
