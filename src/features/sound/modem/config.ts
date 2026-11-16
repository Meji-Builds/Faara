import { CODE_LENGTH } from './alphabet';

/**
 * Physical-layer parameters for the hum modem.
 *
 * Frame layout:  [ sync chirp ][ gap ][ symbol 0 ] … [ symbol N-1 ]
 * Each symbol is one of 32 tones (32-FSK, 5 bits). A symbol slot is
 * `symbolMs` long: a raised-cosine ramp in and out, and the receiver
 * integrates over a `windowMs` window starting `windowOffsetMs` into the slot,
 * leaving guard time at both ends for timing error and room echo.
 */
export interface ModemConfig {
  /** Lowest tone frequency (tone 0), Hz. */
  baseHz: number;
  /** Spacing between adjacent tones, Hz. Must be a multiple of 1000 / windowMs for orthogonality. */
  toneSpacingHz: number;
  toneCount: number;
  /** Sync chirp sweeps linearly from chirpStartHz to chirpEndHz. */
  chirpStartHz: number;
  chirpEndHz: number;
  chirpMs: number;
  /** Silence between the chirp and the first symbol. */
  gapMs: number;
  symbolMs: number;
  rampMs: number;
  windowMs: number;
  windowOffsetMs: number;
  /** Payload characters (5-bit symbols). */
  payloadSymbols: number;
  /** CRC symbols appended to the payload (2 = CRC-10, 3 = CRC-15). */
  crcSymbols: number;
  /** Reed-Solomon parity symbols. */
  paritySymbols: number;
  /** Silence after each frame when broadcasting on a loop. */
  repeatGapMs: number;
}

/**
 * Defaults chosen from channel simulations (see __tests__/modem.test.ts):
 * 32 ms integration at 62.5 Hz spacing keeps tones orthogonal and gives 3 dB more
 * margin than 16 ms; 19 symbols (10 payload + 3 CRC + 6 parity) make a 774 ms frame.
 */
export const DEFAULT_MODEM_CONFIG: ModemConfig = {
  baseHz: 18_000,
  toneSpacingHz: 62.5,
  toneCount: 32,
  chirpStartHz: 18_000,
  chirpEndHz: 20_000,
  chirpMs: 80,
  gapMs: 10,
  symbolMs: 36,
  rampMs: 2,
  windowMs: 32,
  windowOffsetMs: 3,
  payloadSymbols: CODE_LENGTH,
  crcSymbols: 3,
  paritySymbols: 6,
  repeatGapMs: 100,
};

/** Sample counts for a config at a given sample rate. */
export interface FrameTiming {
  sampleRate: number;
  chirp: number;
  gap: number;
  symbol: number;
  ramp: number;
  window: number;
  windowOffset: number;
  codewordSymbols: number;
  /** Offset of the first symbol from the start of the chirp. */
  dataStart: number;
  /** Chirp + gap + all symbols. */
  frame: number;
  repeatGap: number;
}

const samples = (ms: number, sampleRate: number) => Math.round((ms * sampleRate) / 1000);

export function frameTiming(config: ModemConfig, sampleRate: number): FrameTiming {
  const highest = config.baseHz + config.toneSpacingHz * (config.toneCount - 1);
  if (Math.max(highest, config.chirpEndHz) >= sampleRate / 2) {
    throw new RangeError(`Sample rate ${sampleRate} Hz is too low for tones up to ${highest} Hz`);
  }
  const codewordSymbols = config.payloadSymbols + config.crcSymbols + config.paritySymbols;
  const chirp = samples(config.chirpMs, sampleRate);
  const gap = samples(config.gapMs, sampleRate);
  const symbol = samples(config.symbolMs, sampleRate);
  return {
    sampleRate,
    chirp,
    gap,
    symbol,
    ramp: samples(config.rampMs, sampleRate),
    window: samples(config.windowMs, sampleRate),
    windowOffset: samples(config.windowOffsetMs, sampleRate),
    codewordSymbols,
    dataStart: chirp + gap,
    frame: chirp + gap + symbol * codewordSymbols,
    repeatGap: samples(config.repeatGapMs, sampleRate),
  };
}

export function toneFrequency(config: ModemConfig, symbol: number): number {
  return config.baseHz + config.toneSpacingHz * symbol;
}
