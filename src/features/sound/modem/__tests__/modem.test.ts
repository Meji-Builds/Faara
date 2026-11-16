import { randomCode } from '../alphabet';
import { DEFAULT_MODEM_CONFIG, frameTiming } from '../config';
import { HumReceiver, type DecodedHum } from '../receiver';
import { frameDurationMs, synthesizeFrame } from '../transmitter';
import {
  addEcho,
  chunked,
  createRandom,
  mix,
  peakingEq,
  resample,
  speechNoise,
  whiteNoise,
} from './channel';

interface Scenario {
  /** Peak amplitude of the hum as it arrives at the microphone. */
  signalAmplitude: number;
  /** RMS of talking nearby (dominant energy below 4 kHz). */
  speechRms?: number;
  /** RMS of broadband noise (reaches into the hum band). */
  whiteRms?: number;
  echo?: [number, number][];
  /** Response dip/bump inside the band, dB. */
  bandDipDb?: number;
  txRate?: number;
  rxRate?: number;
  /** Clock mismatch between phones, parts per million. */
  driftPpm?: number;
}

interface TrialResult {
  decoded: DecodedHum | undefined;
  /** Milliseconds from the moment the receiver started listening. */
  latencyMs: number | undefined;
}

/** Sends `code` on a loop and listens, starting at a random point in the cycle. */
function runTrial(code: string, scenario: Scenario, seed: number): TrialResult {
  const random = createRandom(seed);
  const txRate = scenario.txRate ?? 48_000;
  const rxRate = scenario.rxRate ?? 48_000;

  // Transmit three back-to-back frames (each includes its repeat gap).
  const frame = synthesizeFrame(code, txRate, { amplitude: scenario.signalAmplitude });
  const looped = new Float32Array(frame.length * 3);
  for (let i = 0; i < 3; i++) looped.set(frame, i * frame.length);

  // The receiver starts listening at a random point in the cycle.
  const startOffset = Math.floor(random() * frame.length);
  let signal: Float32Array = looped.subarray(startOffset);

  if (scenario.bandDipDb) signal = peakingEq(signal, txRate, 19_200, scenario.bandDipDb, 2);
  if (scenario.echo) signal = addEcho(signal, txRate, scenario.echo);
  const ratio = (rxRate / txRate) * (1 + (scenario.driftPpm ?? 0) / 1e6);
  if (ratio !== 1) signal = resample(signal, ratio);

  const parts = [signal];
  if (scenario.speechRms)
    parts.push(speechNoise(signal.length, rxRate, scenario.speechRms, random));
  if (scenario.whiteRms) parts.push(whiteNoise(signal.length, scenario.whiteRms, random));
  const input = mix(...parts);

  const receiver = new HumReceiver({ sampleRate: rxRate });
  for (const chunk of chunked(input, random)) {
    const [decoded] = receiver.push(chunk);
    if (decoded) return { decoded, latencyMs: (decoded.decodedAt / rxRate) * 1000 };
  }
  return { decoded: undefined, latencyMs: undefined };
}

function successRate(scenario: Scenario, trials: number, seed: number) {
  const random = createRandom(seed);
  let successes = 0;
  let wrong = 0;
  const latencies: number[] = [];
  for (let t = 0; t < trials; t++) {
    const code = randomCode();
    const { decoded, latencyMs } = runTrial(code, scenario, Math.floor(random() * 2 ** 31));
    if (decoded?.code === code) {
      successes++;
      latencies.push(latencyMs as number);
    } else if (decoded) {
      wrong++;
    }
  }
  latencies.sort((a, b) => a - b);
  return {
    rate: successes / trials,
    wrong,
    maxLatencyMs: latencies[latencies.length - 1] ?? Infinity,
  };
}

describe('hum modem', () => {
  it('frame fits the latency budget', () => {
    const cycleMs = frameDurationMs() + DEFAULT_MODEM_CONFIG.repeatGapMs;
    // Worst case: listening starts just after a chirp, so one full cycle plus one frame.
    expect(cycleMs + frameDurationMs()).toBeLessThan(2000);
    expect(frameTiming(DEFAULT_MODEM_CONFIG, 44_100).frame).toBeGreaterThan(0);
  });

  it('decodes a clean signal', () => {
    const result = successRate({ signalAmplitude: 0.5 }, 10, 1);
    expect(result.rate).toBe(1);
    expect(result.maxLatencyMs).toBeLessThan(2000);
  });

  it('decodes with loud talking nearby', () => {
    // Speech 20x louder (RMS) than the hum's peak amplitude.
    const result = successRate({ signalAmplitude: 0.02, speechRms: 0.4 }, 20, 2);
    expect(result.rate).toBeGreaterThanOrEqual(0.95);
  });

  it('decodes a quiet signal in in-band noise', () => {
    // ~0 dB in-band SNR: broadband noise RMS ≈ hum RMS / sqrt(2), spread well beyond the band.
    const result = successRate({ signalAmplitude: 0.02, whiteRms: 0.01 }, 20, 3);
    expect(result.rate).toBeGreaterThanOrEqual(0.9);
  });

  it('decodes through echo, an uneven response, sample-rate conversion and clock drift', () => {
    const result = successRate(
      {
        signalAmplitude: 0.05,
        speechRms: 0.3,
        whiteRms: 0.004,
        echo: [
          [2.5, 0.5],
          [6, 0.3],
          [13, 0.15],
        ],
        bandDipDb: -12,
        txRate: 48_000,
        rxRate: 44_100,
        driftPpm: 80,
      },
      20,
      4,
    );
    expect(result.rate).toBeGreaterThanOrEqual(0.9);
  });

  it('never reports a code from noise alone', () => {
    const random = createRandom(5);
    const receiver = new HumReceiver({ sampleRate: 48_000 });
    const noise = mix(
      speechNoise(48_000 * 20, 48_000, 0.5, random),
      whiteNoise(48_000 * 20, 0.02, random),
    );
    const decoded = [...chunked(noise, random)].flatMap((chunk) => receiver.push(chunk));
    expect(decoded).toEqual([]);
  });

  it('never reports a wrong code across stressed trials', () => {
    const result = successRate({ signalAmplitude: 0.01, speechRms: 0.4, whiteRms: 0.008 }, 30, 6);
    expect(result.wrong).toBe(0);
  });
});
