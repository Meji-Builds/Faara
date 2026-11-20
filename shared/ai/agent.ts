import { AssistantValidationError } from './errors';

/**
 * The money agent: plain-language savings rules that move naira into USDC automatically.
 * A rule is drafted by the assistant, read back to the person, and only takes effect after
 * they approve it with their PIN or fingerprint.
 */

export type RuleFrequency = 'daily' | 'weekly' | 'monthly';

/** What the person approves. */
export type RuleDraft =
  | { kind: 'save_percent'; percent: number; summary: string }
  | {
      kind: 'save_fixed';
      amountKobo: number;
      frequency: RuleFrequency;
      /** 0 = Sunday … 6 = Saturday (weekly rules). */
      weekday: number;
      /** 1–28 (monthly rules). */
      dayOfMonth: number;
      summary: string;
    };

/** A saved rule, with the agent's bookkeeping. */
export type MoneyRule = RuleDraft & {
  id: string;
  createdAt: number;
  /** save_percent: income after this time hasn't been counted yet. */
  since?: number;
  /** save_percent: owed but below the minimum conversion, carried to next time. */
  carryKobo?: number;
  /** save_fixed: when it next runs. */
  nextRunAt?: number;
};

/** One thing the agent did (or couldn't do). */
export interface AgentLogEntry {
  id: string;
  ruleId: string;
  summary: string;
  amountKobo: number;
  status: 'done' | 'pending' | 'skipped';
  reason: string;
  createdAt: number;
}

export const AGENT_LIMITS = {
  maxRules: 5,
  minPercent: 1,
  maxPercent: 90,
  /** The smallest conversion: ₦100. */
  minKobo: 10_000,
  maxKobo: 100_000_000,
} as const;

/** Lagos is UTC+1 all year. Scheduled rules run at 09:00 Lagos time. */
const LAGOS_OFFSET_MS = 3_600_000;
const RUN_HOUR = 9;
const DAY_MS = 86_400_000;

/** The next time a fixed rule runs, strictly after `after`. */
export function nextRunAt(
  rule: { frequency: RuleFrequency; weekday: number; dayOfMonth: number },
  after: number,
): number {
  const local = new Date(after + LAGOS_OFFSET_MS);
  let candidate =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), RUN_HOUR) -
    LAGOS_OFFSET_MS;
  for (let i = 0; i < 64; i++, candidate += DAY_MS) {
    if (candidate <= after) continue;
    const day = new Date(candidate + LAGOS_OFFSET_MS);
    if (rule.frequency === 'daily') return candidate;
    if (rule.frequency === 'weekly' && day.getUTCDay() === rule.weekday) return candidate;
    if (rule.frequency === 'monthly' && day.getUTCDate() === rule.dayOfMonth) return candidate;
  }
  throw new Error('No next run found');
}

const FREQUENCIES: RuleFrequency[] = ['daily', 'weekly', 'monthly'];

/** Checks a draft (from the assistant, or sent back by the phone) before it is saved. */
export function parseRuleDraft(body: unknown): RuleDraft {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const summary = typeof data.summary === 'string' ? data.summary.trim().slice(0, 200) : '';
  if (!summary) throw new AssistantValidationError('That rule needs a description.');
  if (data.kind === 'save_percent') {
    const percent = data.percent;
    if (
      typeof percent !== 'number' ||
      !Number.isInteger(percent) ||
      percent < AGENT_LIMITS.minPercent ||
      percent > AGENT_LIMITS.maxPercent
    ) {
      throw new AssistantValidationError('Choose a percentage between 1 and 90.');
    }
    return { kind: 'save_percent', percent, summary };
  }
  if (data.kind === 'save_fixed') {
    const { amountKobo, frequency, weekday, dayOfMonth } = data;
    if (
      typeof amountKobo !== 'number' ||
      !Number.isSafeInteger(amountKobo) ||
      amountKobo < AGENT_LIMITS.minKobo ||
      amountKobo > AGENT_LIMITS.maxKobo
    ) {
      throw new AssistantValidationError('Choose an amount between ₦100 and ₦1,000,000.');
    }
    if (!FREQUENCIES.includes(frequency as RuleFrequency)) {
      throw new AssistantValidationError('Choose daily, weekly or monthly.');
    }
    const day = typeof weekday === 'number' && Number.isInteger(weekday) ? weekday : -1;
    const date = typeof dayOfMonth === 'number' && Number.isInteger(dayOfMonth) ? dayOfMonth : -1;
    if (frequency === 'weekly' && (day < 0 || day > 6)) {
      throw new AssistantValidationError('Choose a day of the week.');
    }
    if (frequency === 'monthly' && (date < 1 || date > 28)) {
      throw new AssistantValidationError('Choose a day of the month from 1 to 28.');
    }
    return {
      kind: 'save_fixed',
      amountKobo,
      frequency: frequency as RuleFrequency,
      weekday: frequency === 'weekly' ? day : 0,
      dayOfMonth: frequency === 'monthly' ? date : 1,
      summary,
    };
  }
  throw new AssistantValidationError('That kind of rule isn’t available yet.');
}

export function parseRuleId(body: unknown): { id: string } {
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !/^RL[A-Za-z0-9_-]{6,40}$/.test(id)) {
    throw new AssistantValidationError('That rule isn’t valid.');
  }
  return { id };
}
