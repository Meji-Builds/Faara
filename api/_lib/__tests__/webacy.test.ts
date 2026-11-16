import { parseWebacyResponse } from '../webacy';

describe('parseWebacyResponse', () => {
  it('reads a top-level score and the first issue tag', () => {
    expect(
      parseWebacyResponse({
        overallRisk: 72.5,
        issues: [{ tags: [{ name: 'phishing_activities' }] }],
      }),
    ).toEqual({ score: 72.5, topIssue: 'Phishing Activities' });
  });

  it('reads a score nested under risk', () => {
    expect(parseWebacyResponse({ risk: { overallRisk: 4, issues: [] } })).toEqual({
      score: 4,
      topIssue: null,
    });
  });

  it('returns null for missing or invalid scores', () => {
    expect(parseWebacyResponse({})).toBeNull();
    expect(parseWebacyResponse({ overallRisk: 'n/a' })).toBeNull();
    expect(parseWebacyResponse(null)).toBeNull();
  });

  it('clamps out-of-range scores', () => {
    expect(parseWebacyResponse({ overallRisk: 140 })?.score).toBe(100);
  });
});
