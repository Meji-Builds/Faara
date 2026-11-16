import { scoreTrial, summarize, TARGET_LATENCY_MS } from '../trials';

describe('Sound lab trials', () => {
  it('passes a matching code within the target time', () => {
    expect(
      scoreTrial(1, { code: 'ABCDE12345', correctedSymbols: 0 }, 900, 'abcde12345').passed,
    ).toBe(true);
  });

  it('fails a wrong code, a slow decode, or no decode', () => {
    expect(
      scoreTrial(1, { code: 'ABCDE12345', correctedSymbols: 0 }, 900, 'ZZZZZ12345').passed,
    ).toBe(false);
    expect(
      scoreTrial(2, { code: 'ABCDE12345', correctedSymbols: 0 }, TARGET_LATENCY_MS + 1, '').passed,
    ).toBe(false);
    expect(scoreTrial(3, null, 5000, '').passed).toBe(false);
  });

  it('accepts any code when none is expected', () => {
    expect(scoreTrial(1, { code: 'ABCDE12345', correctedSymbols: 2 }, 1500, '').passed).toBe(true);
  });

  it('summarises pass rate, median and max latency of decoded trials', () => {
    const results = [
      scoreTrial(1, { code: 'A000000000', correctedSymbols: 0 }, 800, ''),
      scoreTrial(2, { code: 'A000000000', correctedSymbols: 0 }, 1200, ''),
      scoreTrial(3, null, 5000, ''),
    ];
    expect(summarize(results)).toEqual({ total: 3, passed: 2, medianMs: 1000, maxMs: 1200 });
    expect(summarize([])).toEqual({ total: 0, passed: 0, medianMs: null, maxMs: null });
  });
});
