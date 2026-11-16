import { useEffect, useRef, useState } from 'react';

import {
  bleAvailability,
  requestBlePermissions,
  startBleBroadcast,
  startBleScan,
  stopBleBroadcast,
  type BleAvailability,
} from './bleEngine';

export type BleChannelState = 'off' | 'starting' | 'active' | 'denied' | 'error' | BleAvailability;

/** Advertises `token` over Bluetooth while it is non-null. */
export function useBleBroadcast(token: string | null): BleChannelState {
  const [state, setState] = useState<BleChannelState>(() => (token ? 'starting' : 'off'));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const availability = bleAvailability();
      if (availability !== 'ready') return !cancelled && setState(availability);
      if (!(await requestBlePermissions())) return !cancelled && setState('denied');
      if (cancelled) return;
      try {
        await startBleBroadcast(token);
        if (!cancelled) setState('active');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      stopBleBroadcast();
    };
  }, [token]);

  return token ? state : 'off';
}

/** Scans for hum codes over Bluetooth while `enabled`; calls `onToken` for each sighting. */
export function useBleScan(
  enabled: boolean,
  onToken: (token: string, rssi: number) => void,
): BleChannelState {
  const [state, setState] = useState<BleChannelState>('off');
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;
    (async () => {
      const availability = bleAvailability();
      if (availability !== 'ready') return !cancelled && setState(availability);
      if (!(await requestBlePermissions())) return !cancelled && setState('denied');
      if (cancelled) return;
      try {
        stop = await startBleScan((token, rssi) => onTokenRef.current(token, rssi));
        if (cancelled) stop();
        else setState('active');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [enabled]);

  return enabled ? state : 'off';
}
