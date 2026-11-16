/**
 * Test-only acoustic channel simulator: models what happens between one phone's
 * speaker and another's microphone so the modem can be evaluated without hardware.
 */

/** Deterministic PRNG (mulberry32) so test runs are reproducible. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Linear-interpolation resampling; `ratio` = output rate / input rate. */
export function resample(input: Float32Array, ratio: number): Float32Array {
  const out = new Float32Array(Math.floor(input.length * ratio));
  for (let i = 0; i < out.length; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

/** Room echo as a handful of delayed, attenuated copies. */
export function addEcho(
  input: Float32Array,
  sampleRate: number,
  taps: [delayMs: number, gain: number][],
): Float32Array {
  const out = Float32Array.from(input);
  for (const [delayMs, gain] of taps) {
    const delay = Math.round((delayMs * sampleRate) / 1000);
    for (let i = delay; i < out.length; i++)
      out[i] = (out[i] as number) + (input[i - delay] as number) * gain;
  }
  return out;
}

/** RBJ peaking EQ: models an uneven speaker/mic response (a dip or bump in the band). */
export function peakingEq(
  input: Float32Array,
  sampleRate: number,
  centreHz: number,
  gainDb: number,
  q: number,
): Float32Array {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * centreHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha / A;
  const b0 = (1 + alpha * A) / a0;
  const b1 = (-2 * cos) / a0;
  const b2 = (1 - alpha * A) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha / A) / a0;
  const out = new Float32Array(input.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i] as number;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Speech-band noise: white noise shaped by a cascade of one-pole low-passes (~3 kHz),
 * with a slow syllable-rate envelope. Stands in for people talking nearby.
 */
export function speechNoise(
  length: number,
  sampleRate: number,
  rms: number,
  random: () => number,
): Float32Array {
  const out = new Float32Array(length);
  const alpha = 1 - Math.exp((-2 * Math.PI * 3000) / sampleRate);
  let s1 = 0,
    s2 = 0,
    s3 = 0;
  for (let i = 0; i < length; i++) {
    s1 += alpha * (gaussian(random) - s1);
    s2 += alpha * (s1 - s2);
    s3 += alpha * (s2 - s3);
    const syllable = 0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * i) / sampleRate);
    out[i] = s3 * syllable;
  }
  return scaleToRms(out, rms);
}

export function whiteNoise(length: number, rms: number, random: () => number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = gaussian(random) * rms;
  return out;
}

export function scaleToRms(signal: Float32Array, rms: number): Float32Array {
  let sum = 0;
  for (const v of signal) sum += v * v;
  const current = Math.sqrt(sum / signal.length) || 1;
  for (let i = 0; i < signal.length; i++) signal[i] = (signal[i] as number) * (rms / current);
  return signal;
}

export function mix(...signals: Float32Array[]): Float32Array {
  const length = Math.max(...signals.map((s) => s.length));
  const out = new Float32Array(length);
  for (const signal of signals)
    for (let i = 0; i < signal.length; i++) out[i] = (out[i] as number) + (signal[i] as number);
  return out;
}

/** Splits a signal into irregular chunks, like an audio callback would deliver it. */
export function* chunked(
  signal: Float32Array,
  random: () => number,
  min = 256,
  max = 4096,
): Generator<Float32Array> {
  for (let i = 0; i < signal.length;) {
    const size = Math.floor(min + random() * (max - min));
    yield signal.subarray(i, i + size);
    i += size;
  }
}
