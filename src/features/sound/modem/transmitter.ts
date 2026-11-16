import { codeToSymbols } from './alphabet';
import { DEFAULT_MODEM_CONFIG, frameTiming, toneFrequency, type ModemConfig } from './config';
import { crcSymbols } from './crc';
import { rsEncode } from './reedSolomon';

/** Builds the full codeword (payload + CRC + parity) for a hum code. */
export function buildCodeword(code: string, config: ModemConfig = DEFAULT_MODEM_CONFIG): number[] {
  const payload = codeToSymbols(code);
  if (payload.length !== config.payloadSymbols) {
    throw new RangeError(`Expected ${config.payloadSymbols} characters, got ${payload.length}`);
  }
  const withCrc = [...payload, ...crcSymbols(payload, config.crcSymbols)];
  return rsEncode(withCrc, config.paritySymbols);
}

/** Linear chirp with short tapered edges, used for frame sync and channel estimation. */
export function synthesizeChirp(config: ModemConfig, sampleRate: number): Float32Array {
  const { chirp: length, ramp } = frameTiming(config, sampleRate);
  const out = new Float32Array(length);
  const duration = length / sampleRate;
  const sweepRate = (config.chirpEndHz - config.chirpStartHz) / duration;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * (config.chirpStartHz * t + 0.5 * sweepRate * t * t);
    out[i] = Math.sin(phase) * envelope(i, length, ramp);
  }
  return out;
}

/** Raised-cosine fade in and out over `ramp` samples. */
function envelope(i: number, length: number, ramp: number): number {
  if (ramp <= 0) return 1;
  if (i < ramp) return 0.5 - 0.5 * Math.cos((Math.PI * i) / ramp);
  if (i >= length - ramp) return 0.5 - 0.5 * Math.cos((Math.PI * (length - 1 - i)) / ramp);
  return 1;
}

export interface SynthesizeOptions {
  config?: ModemConfig;
  /** Peak amplitude, 0–1. */
  amplitude?: number;
  /** Append the inter-frame silence, for seamless looping. */
  includeRepeatGap?: boolean;
}

/** Renders one complete frame for `code` as PCM samples in [-1, 1]. */
export function synthesizeFrame(
  code: string,
  sampleRate: number,
  options: SynthesizeOptions = {},
): Float32Array {
  const { config = DEFAULT_MODEM_CONFIG, amplitude = 0.9, includeRepeatGap = true } = options;
  const timing = frameTiming(config, sampleRate);
  const codeword = buildCodeword(code, config);
  const out = new Float32Array(timing.frame + (includeRepeatGap ? timing.repeatGap : 0));

  const chirp = synthesizeChirp(config, sampleRate);
  for (let i = 0; i < chirp.length; i++) out[i] = (chirp[i] as number) * amplitude;

  codeword.forEach((symbol, index) => {
    const start = timing.dataStart + index * timing.symbol;
    const omega = (2 * Math.PI * toneFrequency(config, symbol)) / sampleRate;
    for (let i = 0; i < timing.symbol; i++) {
      out[start + i] = Math.sin(omega * i) * envelope(i, timing.symbol, timing.ramp) * amplitude;
    }
  });
  return out;
}

/** Frame duration in milliseconds, excluding the repeat gap. */
export function frameDurationMs(config: ModemConfig = DEFAULT_MODEM_CONFIG): number {
  const symbols = config.payloadSymbols + config.crcSymbols + config.paritySymbols;
  return config.chirpMs + config.gapMs + symbols * config.symbolMs;
}
