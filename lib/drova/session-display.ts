import type { MerchantSession } from './types';

export function isCurrentSession(session: MerchantSession) {
  return (
    session.finished_on == null &&
    ['ACTIVE', 'HANDSHAKE'].includes(session.status.toUpperCase())
  );
}

// Display-only timing: accounting and CSV keep using completed-session durations.
export function sessionDisplayTiming(session: MerchantSession, now: number) {
  const ongoing = isCurrentSession(session);
  const end = ongoing ? now : session.finished_on;
  if (
    !Number.isFinite(session.created_on) ||
    end == null ||
    !Number.isFinite(end)
  ) {
    return { ongoing, duration: null };
  }
  const duration = end - session.created_on;
  return {
    ongoing,
    duration: ongoing ? Math.max(0, duration) : duration >= 0 ? duration : null,
  };
}
