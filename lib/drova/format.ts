export const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

export const integerFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

export function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

export function formatHeartbeat(timestamp?: number | null) {
  if (!timestamp) return 'нет данных';
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return 'только что';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} мин назад`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} ч назад`;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(timestamp);
}

export function isStationOnline(
  state?: string | null,
  heartbeat?: number | null,
) {
  if (
    state &&
    ['ONLINE', 'READY', 'LISTEN', 'BUSY'].includes(state.toUpperCase())
  )
    return true;
  return Boolean(heartbeat && Date.now() - heartbeat < 5 * 60_000);
}

export function getStationDisplayStatus(
  state?: string | null,
  heartbeat?: number | null,
  latestSessionStatus?: string | null,
) {
  const online = isStationOnline(state, heartbeat);
  if (!online) return { label: 'Не в сети', dotClass: 'bg-slate-400' };
  if (
    state?.toUpperCase() === 'BUSY' ||
    latestSessionStatus?.toUpperCase() === 'ACTIVE'
  ) {
    return { label: 'Используется', dotClass: 'bg-amber-500' };
  }
  if (state?.toUpperCase() === 'UNVERIFIED') {
    return { label: 'Не проверена', dotClass: 'bg-sky-500' };
  }
  return { label: 'Готова', dotClass: 'bg-emerald-500' };
}
