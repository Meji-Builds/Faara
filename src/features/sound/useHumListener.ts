import { useCallback, useEffect, useRef, useState } from 'react';

import { audioEngine, type CaptureSession } from './audio';
import { microphoneError } from '@/lib/errors';
import { DEFAULT_MODEM_CONFIG, HumReceiver, type DecodedHum, type ModemConfig } from './modem';

export type ListenState = 'idle' | 'starting' | 'listening' | 'denied' | 'error';

export interface ListenerMeters {
  /** Ultrasonic band level, 0–1 (RMS). */
  bandLevel: number;
  /** Latest sync correlation, 0–1. */
  syncPeak: number;
  framesDetected: number;
  framesFailed: number;
}

const METER_INTERVAL_MS = 100;
const EMPTY_METERS: ListenerMeters = {
  bandLevel: 0,
  syncPeak: 0,
  framesDetected: 0,
  framesFailed: 0,
};

/**
 * Listens on the microphone and decodes hum codes.
 * `onDecode` fires for every successfully decoded frame (the same code repeats
 * while the sender keeps humming; de-duplicate in the caller if needed).
 */
export function useHumListener(
  onDecode: (hum: DecodedHum, receiver: HumReceiver) => void,
  config: ModemConfig = DEFAULT_MODEM_CONFIG,
) {
  const [state, setState] = useState<ListenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [inputDescription, setInputDescription] = useState<string | null>(null);
  const [meters, setMeters] = useState<ListenerMeters>(EMPTY_METERS);

  const session = useRef<CaptureSession | null>(null);
  const receiver = useRef<HumReceiver | null>(null);
  const backlog = useRef<Float32Array[]>([]);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const handleSamples = useCallback((samples: Float32Array) => {
    const current = receiver.current;
    // Samples can arrive before the capture session reports its sample rate.
    if (!current) {
      backlog.current.push(samples);
      return;
    }
    for (const hum of current.push(samples)) onDecodeRef.current(hum, current);
  }, []);

  const stop = useCallback(async () => {
    const active = session.current;
    session.current = null;
    receiver.current = null;
    backlog.current = [];
    setState('idle');
    setMeters(EMPTY_METERS);
    await active?.stop().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    if (session.current) return;
    setError(null);
    setState('starting');
    try {
      const granted = await audioEngine.requestMicrophonePermission();
      if (!granted) {
        setState('denied');
        return;
      }
      const capture = await audioEngine.startCapture(handleSamples);
      session.current = capture;
      receiver.current = new HumReceiver({ sampleRate: capture.sampleRate, config });
      const pending = backlog.current;
      backlog.current = [];
      pending.forEach(handleSamples);
      setInputDescription(capture.description);
      setState('listening');
    } catch (cause) {
      setError(microphoneError(cause));
      setState('error');
    }
  }, [config, handleSamples]);

  /** Starts decoding afresh (drops buffered audio) without reopening the microphone. */
  const restart = useCallback(() => {
    const current = receiver.current;
    if (!current) return;
    receiver.current = new HumReceiver({ sampleRate: current.sampleRate, config });
  }, [config]);

  useEffect(() => {
    if (state !== 'listening') return;
    const timer = setInterval(() => {
      const stats = receiver.current?.stats;
      if (!stats) return;
      setMeters({
        bandLevel: stats.bandLevel,
        syncPeak: stats.lastSyncPeak,
        framesDetected: stats.framesDetected,
        framesFailed: stats.framesFailed,
      });
    }, METER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(
    () => () => {
      session.current?.stop().catch(() => undefined);
    },
    [],
  );

  return {
    state,
    error,
    meters,
    inputDescription,
    start,
    stop,
    restart,
    available: audioEngine.available,
    unavailableReason: audioEngine.unavailableReason,
  };
}
