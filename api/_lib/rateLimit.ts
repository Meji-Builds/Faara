import { RATE_LIMITS, type RateLimitedAction } from '../../shared/hum';

import { ApiError } from './errors';
import type { DocumentStore } from './store';

const WINDOW_MS = 60_000;

interface RateLimitDoc {
  windowStart: number;
  count: number;
}

/**
 * Counts one request against the per-minute limit for `action`; throws once exceeded.
 * Runs in its own transaction so that a request that later fails still counts.
 */
export async function consumeRate(
  store: DocumentStore,
  now: () => number,
  uid: string,
  action: RateLimitedAction,
): Promise<void> {
  const path = `rateLimits/${uid}_${action}`;
  await store.transaction(async (tx) => {
    const time = now();
    const current = await tx.get<RateLimitDoc>(path);
    const inWindow = current !== undefined && time - current.windowStart < WINDOW_MS;
    const count = inWindow ? current.count : 0;
    if (count >= RATE_LIMITS[action]) {
      throw new ApiError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
    }
    tx.set(path, {
      windowStart: inWindow ? current.windowStart : time,
      count: count + 1,
    } satisfies RateLimitDoc);
  });
}
