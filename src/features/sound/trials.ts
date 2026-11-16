/**
 * Bookkeeping for Sound lab trials: one trial = time from "start listening"
 * to the first decoded code, scored against the milestone target.
 */

/** Milestone 1 target: decode within this time. */
export const TARGET_LATENCY_MS = 2000;
/** A trial with no decode by this time counts as a failure. */
export const TRIAL_TIMEOUT_MS = 5000;

export interface TrialResult {
  id: number;
  code: string | null;
  latencyMs: number;
  /** Decoded the expected code (or any code, when none is expected) within the target time. */
  passed: boolean;
  correctedSymbols: number;
}

export interface TrialSummary {
  total: number;
  passed: number;
  medianMs: number | null;
  maxMs: number | null;
}

export function scoreTrial(
  id: number,
  decoded: { code: string; correctedSymbols: number } | null,
  latencyMs: number,
  expectedCode: string,
): TrialResult {
  const expected = expectedCode.trim().toUpperCase();
  const matches = decoded !== null && (expected === '' || decoded.code === expected);
  return {
    id,
    code: decoded?.code ?? null,
    latencyMs,
    passed: matches && latencyMs <= TARGET_LATENCY_MS,
    correctedSymbols: decoded?.correctedSymbols ?? 0,
  };
}

export function summarize(results: readonly TrialResult[]): TrialSummary {
  const latencies = results
    .filter((r) => r.code !== null)
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);
  const mid = Math.floor(latencies.length / 2);
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    medianMs: latencies.length
      ? latencies.length % 2
        ? (latencies[mid] as number)
        : Math.round(((latencies[mid - 1] as number) + (latencies[mid] as number)) / 2)
      : null,
    maxMs: latencies.length ? (latencies[latencies.length - 1] as number) : null,
  };
}
