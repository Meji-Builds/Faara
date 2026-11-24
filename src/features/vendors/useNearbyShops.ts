import { useCallback, useEffect, useState } from 'react';

import { isTillCode, type ShopInfo } from '@shared/vendors';

import { estimateDistanceFromRssi, useBleScan } from '@/features/ble';
import { estimateDistanceCm, useHumListener } from '@/features/sound';

import { lookupShop } from './vendorsApi';

export interface NearbyShop extends ShopInfo {
  /** Rough distance in centimetres, when the signal gave one. */
  distanceCm: number | null;
}

/** A shop drops off the list once its till hasn't been heard for this long. */
const FORGET_AFTER_MS = 20_000;

/** Shops looked up this session. Codes that aren't a shop just never show. */
const known = new Map<string, ShopInfo | null>();
const pending = new Set<string>();
/** When a lookup last failed; it's tried again after a short wait. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 8_000;

interface Sighting {
  distanceCm: number | null;
  seenAt: number;
}

/** Nearby shops first, then the rest by when they were heard. */
export function rankShops(
  sightings: ReadonlyMap<string, Sighting>,
  shops: ReadonlyMap<string, ShopInfo | null>,
  now: number,
): NearbyShop[] {
  const found: (NearbyShop & { seenAt: number })[] = [];
  for (const [code, sighting] of sightings) {
    const shop = shops.get(code);
    if (!shop || now - sighting.seenAt > FORGET_AFTER_MS) continue;
    found.push({ ...shop, distanceCm: sighting.distanceCm, seenAt: sighting.seenAt });
  }
  return found
    .sort(
      (a, b) =>
        (a.distanceCm ?? Number.MAX_SAFE_INTEGER) - (b.distanceCm ?? Number.MAX_SAFE_INTEGER) ||
        b.seenAt - a.seenAt,
    )
    .map(({ seenAt: _seenAt, ...shop }) => shop);
}

/**
 * Verified shops whose tills this phone can hear right now, by sound or Bluetooth, closest
 * first. Each till code is checked with Faara once, so only real, approved vendors show.
 */
export function useNearbyShops(enabled: boolean): NearbyShop[] {
  const [sightings, setSightings] = useState(() => new Map<string, Sighting>());
  const [, setLookups] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const sighted = useCallback((code: string, distanceCm: number | null) => {
    if (!isTillCode(code)) return;
    const upper = code.toUpperCase();
    setSightings((current) => {
      const next = new Map(current);
      const before = current.get(upper);
      next.set(upper, {
        // Keep the closest recent reading; distance estimates jump around.
        distanceCm:
          before?.distanceCm != null && distanceCm != null
            ? Math.min(before.distanceCm, distanceCm)
            : (distanceCm ?? before?.distanceCm ?? null),
        seenAt: Date.now(),
      });
      return next;
    });
    if (known.has(upper) || pending.has(upper)) return;
    if (Date.now() - (failedAt.get(upper) ?? 0) < RETRY_AFTER_MS) return;
    pending.add(upper);
    lookupShop(upper)
      .then((shop) => {
        known.set(upper, shop);
        failedAt.delete(upper);
      })
      .catch(() => failedAt.set(upper, Date.now()))
      .finally(() => {
        pending.delete(upper);
        setLookups((n) => n + 1);
      });
  }, []);

  const listener = useHumListener(
    useCallback(
      (decoded) => sighted(decoded.code, estimateDistanceCm(decoded.frameLevel) ?? null),
      [sighted],
    ),
  );
  useBleScan(
    enabled,
    useCallback((token, rssi) => sighted(token, estimateDistanceFromRssi(rssi)), [sighted]),
  );

  const { start, stop } = listener;
  useEffect(() => {
    if (!enabled) return;
    void start();
    return () => {
      void stop();
    };
  }, [enabled, start, stop]);

  // Re-rank now and then, so shops that have gone quiet drop off.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 3_000);
    return () => clearInterval(timer);
  }, [enabled]);

  return enabled ? rankShops(sightings, known, now) : [];
}
