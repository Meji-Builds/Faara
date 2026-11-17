import { useCallback, useEffect, useRef, useState } from 'react';

import { audioEngine } from './audio';
import { microphoneError } from '@/lib/errors';
import { DEFAULT_MODEM_CONFIG, synthesizeFrame, type ModemConfig } from './modem';

export type BroadcastState = 'idle' | 'starting' | 'humming' | 'error';

/**
 * Broadcasts a hum code over the speaker on a seamless loop.
 * The frame is rendered at the device's native output rate to avoid resampling.
 */
export function useHumBroadcaster(config: ModemConfig = DEFAULT_MODEM_CONFIG) {
  const [state, setState] = useState<BroadcastState>('idle');
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);

  const stop = useCallback(async () => {
    active.current = false;
    await audioEngine.stopPlayback().catch(() => undefined);
    setState('idle');
  }, []);

  const start = useCallback(
    async (code: string, volume: number) => {
      setError(null);
      setState('starting');
      try {
        const sampleRate = await audioEngine.playbackSampleRate();
        const frame = synthesizeFrame(code, sampleRate, { config, includeRepeatGap: true });
        await audioEngine.startPlayback(frame, sampleRate, { loop: true, volume });
        active.current = true;
        setState('humming');
      } catch (cause) {
        setError(microphoneError(cause));
        setState('error');
      }
    },
    [config],
  );

  useEffect(
    () => () => {
      if (active.current) audioEngine.stopPlayback().catch(() => undefined);
    },
    [],
  );

  return {
    state,
    error,
    start,
    stop,
    available: audioEngine.available,
    unavailableReason: audioEngine.unavailableReason,
  };
}
