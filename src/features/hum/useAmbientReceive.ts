import { useCallback, useEffect, useRef } from 'react';

import type { ClaimChannel } from '@shared/hum';

import { estimateDistanceFromRssi, useBleScan, type BleChannelState } from '@/features/ble';
import { estimateDistanceCm, useHumListener, type ListenState } from '@/features/sound';

export interface CaughtHum {
  token: string;
  channel: Extract<ClaimChannel, 'sound' | 'bluetooth'>;
  distanceCm?: number;
}

/** A hum just handled; the sender keeps humming, so ignore it briefly after returning. */
const COOLDOWN_MS = 60_000;
let recent: { token: string; at: number } | null = null;

interface AmbientReceive {
  sound: ListenState;
  bluetooth: BleChannelState;
}

/**
 * Listens for a hum (sound and Bluetooth) while `enabled`, and reports the first one
 * caught. The microphone is released as soon as `enabled` turns false or a hum is caught.
 */
export function useAmbientReceive(
  enabled: boolean,
  onCaught: (hum: CaughtHum) => void,
): AmbientReceive {
  const caught = useRef(false);
  const onCaughtRef = useRef(onCaught);
  useEffect(() => {
    onCaughtRef.current = onCaught;
  }, [onCaught]);

  const report = useCallback((hum: CaughtHum) => {
    if (caught.current) return;
    if (recent && recent.token === hum.token && Date.now() - recent.at < COOLDOWN_MS) return;
    caught.current = true;
    recent = { token: hum.token, at: Date.now() };
    onCaughtRef.current(hum);
  }, []);

  const listener = useHumListener(
    useCallback(
      (decoded) =>
        report({
          token: decoded.code,
          channel: 'sound',
          distanceCm: estimateDistanceCm(decoded.frameLevel),
        }),
      [report],
    ),
  );
  const bluetooth = useBleScan(
    enabled,
    useCallback(
      (token, rssi) =>
        report({ token, channel: 'bluetooth', distanceCm: estimateDistanceFromRssi(rssi) }),
      [report],
    ),
  );

  const { start, stop } = listener;
  useEffect(() => {
    if (!enabled) return;
    caught.current = false;
    start();
    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return { sound: listener.state, bluetooth };
}
