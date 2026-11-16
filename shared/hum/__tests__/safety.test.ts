import { assessSafety } from '../safety';

const NOW = 1_700_000_000_000;

describe('assessSafety', () => {
  it('reports a low-risk wallet with history', () => {
    expect(
      assessSafety(
        { accountAgeDays: 400, paidBefore: 4, wallet: { score: 5, topIssue: null } },
        NOW,
      ),
    ).toMatchObject({
      level: 'low',
      headline: 'Wallet checked · Low risk',
      detail: 'Paid 4× before',
      walletChecked: true,
    });
  });

  it('flags new accounts the sender has never paid', () => {
    expect(assessSafety({ accountAgeDays: 3.4, paidBefore: 0, wallet: null }, NOW)).toMatchObject({
      level: 'caution',
      headline: 'New account · 3 days old',
    });
    expect(assessSafety({ accountAgeDays: 0.2, paidBefore: 0, wallet: null }, NOW).headline).toBe(
      'New account · joined today',
    );
    // Paying someone before outweighs a young account.
    expect(assessSafety({ accountAgeDays: 3, paidBefore: 1, wallet: null }, NOW).level).toBe('low');
  });

  it('lets a high wallet risk outrank everything else', () => {
    expect(
      assessSafety(
        { accountAgeDays: 2, paidBefore: 0, wallet: { score: 88, topIssue: 'Phishing' } },
        NOW,
      ),
    ).toMatchObject({
      level: 'high',
      headline: 'High risk · Phishing',
    });
    expect(
      assessSafety(
        { accountAgeDays: 400, paidBefore: 0, wallet: { score: 30, topIssue: null } },
        NOW,
      ).level,
    ).toBe('caution');
  });

  it('says plainly when nothing could be checked', () => {
    expect(assessSafety({ accountAgeDays: 400, paidBefore: 0, wallet: null }, NOW)).toMatchObject({
      level: 'unchecked',
      headline: 'Wallet not checked',
      walletChecked: false,
    });
  });
});
