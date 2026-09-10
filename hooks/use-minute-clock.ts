'use client';

import { useEffect, useState } from 'react';

export function useMinuteClock(enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled]);
  return now;
}
