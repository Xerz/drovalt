export const HIDDEN_STATIONS_STORAGE_KEY = 'drovalt.hiddenStations.v1';

export type HiddenStationPreferences = Record<string, string[]>;

export function hiddenStationScope(mode: string, accountId: string) {
  return `${mode}:${accountId}`;
}

export function parseHiddenStationPreferences(
  raw: string | null,
): HiddenStationPreferences {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const entries = Object.entries(value);
    if (
      entries.some(
        ([scope, ids]) =>
          !/^(demo|live):.+$/.test(scope) ||
          !Array.isArray(ids) ||
          ids.some((id) => typeof id !== 'string' || !id.trim()),
      )
    )
      return {};
    return Object.fromEntries(
      entries.map(([scope, ids]) => [scope, [...new Set(ids as string[])]]),
    );
  } catch {
    return {};
  }
}
