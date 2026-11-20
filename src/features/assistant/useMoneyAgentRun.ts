import { useEffect, useRef } from 'react';

import { useAppActive } from '@/lib/useAppActive';
import { useOnline } from '@/lib/connectivity';

import { runMoneyAgent } from './assistantApi';

const EVERY_MS = 10 * 60_000;

/** Lets the money agent catch up when the app opens (the daily schedule covers the rest). */
export function useMoneyAgentRun(enabled: boolean): void {
  const active = useAppActive();
  const online = useOnline();
  const lastRun = useRef(0);
  useEffect(() => {
    if (!enabled || !active || !online) return;
    const now = Date.now();
    if (now - lastRun.current < EVERY_MS) return;
    lastRun.current = now;
    runMoneyAgent().catch(() => {
      // Nothing to show: the next opening or the daily schedule tries again.
    });
  }, [enabled, active, online]);
}
