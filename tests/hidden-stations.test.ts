import { describe, expect, it } from 'vitest';

import {
  hiddenStationScope,
  parseHiddenStationPreferences,
} from '@/lib/drova/hidden-stations';

describe('hidden station preferences', () => {
  it('keeps accounts and demo/live mode separate and deduplicates station ids', () => {
    const scopes = [
      hiddenStationScope('live', 'account-a'),
      hiddenStationScope('live', 'account-b'),
      hiddenStationScope('demo', 'account-a'),
    ];
    expect(new Set(scopes).size).toBe(3);
    const preferences = parseHiddenStationPreferences(
      JSON.stringify({
        [scopes[0]]: ['station-a', 'station-a'],
        [scopes[1]]: ['station-b'],
        [scopes[2]]: [],
      }),
    );
    expect(preferences[scopes[0]]).toEqual(['station-a']);
    expect(preferences[scopes[1]]).toEqual(['station-b']);
    expect(preferences[scopes[2]]).toEqual([]);
  });

  it.each([
    null,
    '',
    '{',
    'null',
    '[]',
    '42',
    '{"live:account":true}',
    '{"live:account":[1]}',
    '{"live:account":[""]}',
    '{"live:account":[" "]}',
    '{"unknown:account":[]}',
    '{"live:":[]}',
  ])('treats malformed storage as an empty list (%s)', (raw) => {
    expect(parseHiddenStationPreferences(raw)).toEqual({});
  });
});
