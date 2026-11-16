import { CODE_LENGTH, symbolsToCode } from './alphabet';
import {
  DEFAULT_MODEM_CONFIG,
  frameTiming,
  toneFrequency,
  type FrameTiming,
  type ModemConfig,
} from './config';
import { crcSymbols } from './crc';
import { FFT, goertzelPower, HighPassFilter, nextPowerOfTwo } from './dsp';
import { ReedSolomonError, rsDecode } from './reedSolomon';
import { synthesizeChirp } from './transmitter';

export interface DecodedHum {
  code: string;
  /** Absolute sample index (since the receiver started) where the frame's chirp begins. */
  frameStart: number;
  /** Absolute sample index at which decoding completed (end of the frame). */
  decodedAt: number;
  /** Normalised sync correlation, 0–1. Higher means a cleaner signal. */
  syncQuality: number;
  /** Symbols repaired by Reed-Solomon (errors + erasures). */
  correctedSymbols: number;
  /** RMS level of the high-passed signal across the frame (a proximity cue). */
  frameLevel: number;
}

export interface ReceiverStats {
  /** RMS level of the filtered (ultrasonic band) input over the last chunk. */
  bandLevel: number;
  /** Highest sync correlation seen in the last processed block. */
  lastSyncPeak: number;
  framesDetected: number;
  framesDecoded: number;
  framesFailed: number;
}

export interface ReceiverOptions {
  sampleRate: number;
  config?: ModemConfig;
  /** Minimum normalised correlation for a sync detection. */
  syncThreshold?: number;
  /** High-pass cutoff applied before detection and demodulation. */
  highPassHz?: number;
}

/** Re-scan this many samples at the end of each block so edge peaks are not missed. */
const BLOCK_OVERLAP = 256;
/** Timing offsets (ms) tried when demodulating, to absorb sync jitter. */
const TIMING_OFFSETS_MS = [0, -0.5, 0.5];
/** Window used to read the chirp's level at each tone frequency (channel estimate). */
const CHANNEL_PROBE_MS = 4;

/**
 * Streaming hum decoder. Feed raw microphone samples with `push`; it high-passes the
 * input, finds sync chirps with an FFT matched filter, estimates the speaker/mic
 * response from the chirp, demodulates the 32-FSK symbols and corrects them with
 * Reed-Solomon. Decoded codes are returned from `push` as they complete.
 */
export class HumReceiver {
  readonly sampleRate: number;
  readonly config: ModemConfig;
  private readonly timing: FrameTiming;
  private readonly syncThreshold: number;
  private readonly filter: HighPassFilter;

  // Matched filter (overlap-save).
  private readonly template: Float32Array;
  private readonly templateEnergy: number;
  private readonly fft: FFT;
  private readonly templateRe: Float64Array;
  private readonly templateIm: Float64Array;
  private readonly hop: number;

  // Sample history, indexed absolutely from `bufferStart`.
  private buffer: Float32Array;
  private bufferStart = 0;
  private bufferLength = 0;
  private scanFrom = 0;
  private suppressUntil = -1;
  private readonly pending: { start: number; quality: number }[] = [];
  private readonly toneGainProbe: { start: number; templatePower: number }[];

  readonly stats: ReceiverStats = {
    bandLevel: 0,
    lastSyncPeak: 0,
    framesDetected: 0,
    framesDecoded: 0,
    framesFailed: 0,
  };

  constructor({
    sampleRate,
    config = DEFAULT_MODEM_CONFIG,
    syncThreshold = 0.3,
    highPassHz = 16_500,
  }: ReceiverOptions) {
    this.sampleRate = sampleRate;
    this.config = config;
    this.timing = frameTiming(config, sampleRate);
    this.syncThreshold = syncThreshold;
    this.filter = new HighPassFilter(highPassHz, sampleRate);

    this.template = synthesizeChirp(config, sampleRate);
    this.templateEnergy = this.template.reduce((sum, v) => sum + v * v, 0);
    const size = nextPowerOfTwo(this.template.length * 2);
    this.fft = new FFT(size);
    this.templateRe = new Float64Array(size);
    this.templateIm = new Float64Array(size);
    this.templateRe.set(this.template);
    this.fft.transform(this.templateRe, this.templateIm);
    this.hop = size - this.template.length + 1 - BLOCK_OVERLAP;

    this.buffer = new Float32Array(Math.max(sampleRate * 2, size * 2));
    this.toneGainProbe = this.buildChannelProbe();
  }

  /** Total samples received so far. */
  get samplesReceived(): number {
    return this.bufferStart + this.bufferLength;
  }

  /** Processes a chunk of raw samples and returns any codes completed by it. */
  push(chunk: Float32Array): DecodedHum[] {
    const filtered = this.filter.process(chunk);
    let sumSquares = 0;
    for (const v of filtered) sumSquares += v * v;
    this.stats.bandLevel = filtered.length ? Math.sqrt(sumSquares / filtered.length) : 0;

    this.append(filtered);
    this.scan();
    const decoded = this.decodePending();
    this.trim();
    return decoded;
  }

  reset(): void {
    this.bufferStart = 0;
    this.bufferLength = 0;
    this.scanFrom = 0;
    this.suppressUntil = -1;
    this.pending.length = 0;
    Object.assign(this.stats, {
      bandLevel: 0,
      lastSyncPeak: 0,
      framesDetected: 0,
      framesDecoded: 0,
      framesFailed: 0,
    });
  }

  private at(absolute: number): number {
    return absolute - this.bufferStart;
  }

  private append(samples: Float32Array): void {
    const needed = this.bufferLength + samples.length;
    if (needed > this.buffer.length) {
      const grown = new Float32Array(Math.max(needed, this.buffer.length * 2));
      grown.set(this.buffer.subarray(0, this.bufferLength));
      this.buffer = grown;
    }
    this.buffer.set(samples, this.bufferLength);
    this.bufferLength += samples.length;
  }

  /** Drops history that no scan or pending decode still needs. */
  private trim(): void {
    let keepFrom = this.scanFrom;
    for (const candidate of this.pending) keepFrom = Math.min(keepFrom, candidate.start);
    const drop = this.at(keepFrom);
    if (drop <= this.sampleRate) return; // trim in large steps to limit copying
    this.buffer.copyWithin(0, drop, this.bufferLength);
    this.bufferLength -= drop;
    this.bufferStart += drop;
  }

  /** Runs the matched filter over every complete block and queues sync detections. */
  private scan(): void {
    const size = this.fft.size;
    const L = this.template.length;
    const re = new Float64Array(size);
    const im = new Float64Array(size);

    while (this.at(this.scanFrom) + size <= this.bufferLength) {
      const offset = this.at(this.scanFrom);
      for (let i = 0; i < size; i++) re[i] = this.buffer[offset + i] as number;
      im.fill(0);
      this.fft.transform(re, im);
      // Multiply by the conjugate template spectrum -> circular cross-correlation.
      for (let i = 0; i < size; i++) {
        const ar = re[i] as number;
        const ai = im[i] as number;
        const br = this.templateRe[i] as number;
        const bi = this.templateIm[i] as number;
        re[i] = ar * br + ai * bi;
        im[i] = ai * br - ar * bi;
      }
      this.fft.transform(re, im, true);

      // Sliding energy of the input under the template, for normalisation.
      const valid = size - L + 1;
      let energy = 0;
      for (let i = 0; i < L; i++) energy += (this.buffer[offset + i] as number) ** 2;

      let bestIndex = -1;
      let best = 0;
      for (let n = 0; n < valid; n++) {
        if (n > 0) {
          energy +=
            (this.buffer[offset + n + L - 1] as number) ** 2 -
            (this.buffer[offset + n - 1] as number) ** 2;
        }
        if (this.scanFrom + n <= this.suppressUntil || energy <= 1e-12) continue;
        const score = (re[n] as number) / size / Math.sqrt(energy * this.templateEnergy);
        if (score > best) {
          best = score;
          bestIndex = n;
        }
      }
      this.stats.lastSyncPeak = best;

      // A peak in the overlap zone is re-examined by the next block, which sees around it.
      if (best >= this.syncThreshold && bestIndex >= 0 && bestIndex < this.hop) {
        const start = this.scanFrom + bestIndex;
        this.pending.push({ start, quality: best });
        this.stats.framesDetected++;
        // Skip past this chirp; the next frame cannot start before this one ends.
        this.suppressUntil = start + L;
      }
      this.scanFrom += this.hop;
    }
  }

  private decodePending(): DecodedHum[] {
    const results: DecodedHum[] = [];
    const maxOffset = Math.ceil(
      (Math.max(...TIMING_OFFSETS_MS.map(Math.abs)) * this.sampleRate) / 1000,
    );
    for (let i = 0; i < this.pending.length;) {
      const candidate = this.pending[i] as { start: number; quality: number };
      const end = candidate.start + this.timing.frame + maxOffset;
      if (end > this.samplesReceived) {
        i++;
        continue;
      }
      this.pending.splice(i, 1);
      const result = this.decodeFrame(candidate.start, candidate.quality);
      if (result) {
        results.push(result);
        this.stats.framesDecoded++;
        this.suppressUntil = Math.max(this.suppressUntil, candidate.start + this.timing.frame);
      } else {
        this.stats.framesFailed++;
      }
    }
    return results;
  }

  /** Precomputes where in the chirp each tone frequency is swept, for channel estimation. */
  private buildChannelProbe(): { start: number; templatePower: number }[] {
    const { chirpStartHz, chirpEndHz, toneCount } = this.config;
    const L = this.template.length;
    const width = Math.round((CHANNEL_PROBE_MS * this.sampleRate) / 1000);
    return Array.from({ length: toneCount }, (_, symbol) => {
      const frequency = toneFrequency(this.config, symbol);
      const centre = ((frequency - chirpStartHz) / (chirpEndHz - chirpStartHz)) * L;
      const start = Math.min(Math.max(Math.round(centre - width / 2), 0), L - width);
      return {
        start,
        templatePower: goertzelPower(this.template, start, width, frequency, this.sampleRate),
      };
    });
  }

  /** Relative power gain of the speaker → air → microphone path at each tone. */
  private estimateChannel(frameStart: number): Float64Array {
    const width = Math.round((CHANNEL_PROBE_MS * this.sampleRate) / 1000);
    const gains = new Float64Array(this.config.toneCount);
    let max = 0;
    this.toneGainProbe.forEach(({ start, templatePower }, symbol) => {
      const received = goertzelPower(
        this.buffer,
        this.at(frameStart) + start,
        width,
        toneFrequency(this.config, symbol),
        this.sampleRate,
      );
      const gain = templatePower > 0 ? received / templatePower : 0;
      gains[symbol] = gain;
      max = Math.max(max, gain);
    });
    // Floor very weak tones so noise there is not amplified into false decisions.
    const floor = max * 0.02 || 1e-12;
    for (let i = 0; i < gains.length; i++) gains[i] = Math.max(gains[i] as number, floor);
    return gains;
  }

  private decodeFrame(frameStart: number, quality: number): DecodedHum | null {
    const gains = this.estimateChannel(frameStart);
    for (const offsetMs of TIMING_OFFSETS_MS) {
      const offset = Math.round((offsetMs * this.sampleRate) / 1000);
      const { symbols, confidence } = this.demodulate(frameStart + offset, gains);
      const decoded = this.correct(symbols, confidence);
      if (decoded) {
        return {
          code: decoded.code,
          frameStart,
          decodedAt: frameStart + this.timing.frame,
          syncQuality: quality,
          correctedSymbols: decoded.corrected,
          frameLevel: this.frameRms(frameStart),
        };
      }
    }
    return null;
  }

  private frameRms(frameStart: number): number {
    const start = this.at(frameStart);
    const end = Math.min(start + this.timing.frame, this.bufferLength);
    let sum = 0;
    for (let i = start; i < end; i++) sum += (this.buffer[i] as number) ** 2;
    return end > start ? Math.sqrt(sum / (end - start)) : 0;
  }

  private demodulate(
    frameStart: number,
    gains: Float64Array,
  ): { symbols: number[]; confidence: number[] } {
    const { dataStart, symbol: symbolLength, windowOffset, window, codewordSymbols } = this.timing;
    const symbols: number[] = [];
    const confidence: number[] = [];
    for (let s = 0; s < codewordSymbols; s++) {
      const start = this.at(frameStart + dataStart + s * symbolLength + windowOffset);
      let best = -1;
      let bestPower = 0;
      let secondPower = 0;
      for (let tone = 0; tone < this.config.toneCount; tone++) {
        const power =
          goertzelPower(
            this.buffer,
            start,
            window,
            toneFrequency(this.config, tone),
            this.sampleRate,
          ) / (gains[tone] as number);
        if (power > bestPower) {
          secondPower = bestPower;
          bestPower = power;
          best = tone;
        } else if (power > secondPower) {
          secondPower = power;
        }
      }
      symbols.push(Math.max(best, 0));
      confidence.push(bestPower / (secondPower + 1e-20));
    }
    return { symbols, confidence };
  }

  /** Reed-Solomon decode with progressively more low-confidence symbols erased, then CRC check. */
  private correct(
    symbols: number[],
    confidence: number[],
  ): { code: string; corrected: number } | null {
    const { paritySymbols, payloadSymbols, crcSymbols: crcCount } = this.config;
    const leastConfident = confidence
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value)
      .map(({ index }) => index);

    for (let erasureCount = 0; erasureCount <= paritySymbols; erasureCount += 2) {
      try {
        const { message, corrected } = rsDecode(
          symbols,
          paritySymbols,
          leastConfident.slice(0, erasureCount),
        );
        const payload = message.slice(0, payloadSymbols);
        const expected = crcSymbols(payload, crcCount);
        if (expected.some((symbol, i) => message[payloadSymbols + i] !== symbol)) continue;
        if (payload.length !== CODE_LENGTH) continue;
        return { code: symbolsToCode(payload), corrected };
      } catch (error) {
        if (!(error instanceof ReedSolomonError)) throw error;
      }
    }
    return null;
  }
}
