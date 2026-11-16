/**
 * Recipient safety assessment shown before paying. Combines Faara's own signals (account
 * age, payment history between the two people) with an external wallet-risk score
 * (Webacy) for USDC recipients.
 */

export type SafetyLevel = 'low' | 'caution' | 'high' | 'unchecked';

export interface SafetyResult {
  level: SafetyLevel;
  /** Short line for the badge, e.g. "Wallet checked · Low risk" or "New account · 3 days old". */
  headline: string;
  /** Secondary detail, e.g. "Paid 4× before". */
  detail: string | null;
  checkedAt: number;
  /** Whether the external wallet check ran. */
  walletChecked: boolean;
}

/** Accounts younger than this are flagged as new. */
export const NEW_ACCOUNT_DAYS = 7;

/**
 * Webacy `overallRisk` (0–100, higher is riskier) bands. Webacy documents 50.1–100 as high
 * risk; confirm the low/medium boundary against their current risk-levels page.
 */
export const WALLET_RISK_BANDS = { lowMax: 23, mediumMax: 50 } as const;

export interface SafetySignals {
  /** Recipient's Faara account age in days. */
  accountAgeDays: number | null;
  /** Settled payments from this sender to this recipient. */
  paidBefore: number;
  /** External wallet risk, when checked. */
  wallet: { score: number; topIssue: string | null } | null;
}

const SEVERITY: Record<SafetyLevel, number> = { unchecked: 0, low: 1, caution: 2, high: 3 };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Combines signals into one badge. The most severe finding wins. */
export function assessSafety(signals: SafetySignals, now: number): SafetyResult {
  const detail = signals.paidBefore > 0 ? `Paid ${signals.paidBefore}× before` : null;
  const findings: { level: SafetyLevel; headline: string }[] = [];

  if (signals.wallet) {
    const { score, topIssue } = signals.wallet;
    if (score > WALLET_RISK_BANDS.mediumMax) {
      findings.push({
        level: 'high',
        headline: topIssue ? `High risk · ${topIssue}` : 'High-risk wallet',
      });
    } else if (score > WALLET_RISK_BANDS.lowMax) {
      findings.push({
        level: 'caution',
        headline: topIssue ? `Check first · ${topIssue}` : 'Some wallet risk',
      });
    } else {
      findings.push({ level: 'low', headline: 'Wallet checked · Low risk' });
    }
  }

  if (
    signals.accountAgeDays !== null &&
    signals.accountAgeDays < NEW_ACCOUNT_DAYS &&
    signals.paidBefore === 0
  ) {
    const days = Math.max(0, Math.floor(signals.accountAgeDays));
    findings.push({
      level: 'caution',
      headline:
        days === 0 ? 'New account · joined today' : `New account · ${plural(days, 'day')} old`,
    });
  }

  const worst = findings.sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level])[0];
  if (worst) return { ...worst, detail, checkedAt: now, walletChecked: signals.wallet !== null };
  return {
    level: signals.paidBefore > 0 ? 'low' : 'unchecked',
    headline: signals.paidBefore > 0 ? 'Known to you' : 'Wallet not checked',
    detail,
    checkedAt: now,
    walletChecked: false,
  };
}
