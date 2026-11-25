import { ValidationError } from '../hum/validation';

/**
 * Disputes: when a payment went wrong, the payer can ask Faara's team to look at it. While a
 * naira dispute is open the amount is held in the recipient's account so it can't be spent;
 * the team then refunds the payer or releases the hold. Dollar (USDC) payments live in
 * people's own wallets on the blockchain, so Faara can look into them but can't reverse them.
 */

export const DISPUTE_REASONS = [
  'wrong-person',
  'not-received',
  'paid-twice',
  'fraud',
  'other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  'wrong-person': 'I paid the wrong person',
  'not-received': 'I didn’t get what I paid for',
  'paid-twice': 'I was charged twice',
  fraud: 'It was a scam or fraud',
  other: 'Something else',
};

export type DisputeStatus = 'open' | 'refunded' | 'rejected';

/** Refunds this large (in kobo) need a second admin to approve: ₦50,000. */
export const SECOND_APPROVAL_KOBO = 5_000_000;
/** A payment can be disputed for this long after it was made. */
export const DISPUTE_WINDOW_MS = 30 * 24 * 3_600_000;

export interface DisputeParty {
  fullName: string;
  username: string;
}

export interface Dispute {
  /** The disputed payment; one dispute per payment. */
  paymentId: string;
  payer: DisputeParty;
  payee: DisputeParty;
  amountMinor: number;
  currency: 'NGN' | 'USDC';
  reason: DisputeReason;
  details: string;
  status: DisputeStatus;
  /** Naira held in the recipient's account while the dispute is open, in kobo. */
  heldKobo: number;
  /** The support thread where Faara's team talks to the payer about it. */
  ticketId: string | null;
  /** Admins who have approved a refund (large refunds need two). */
  approvals: string[];
  createdAt: number;
  updatedAt: number;
  decision: { by: string; note: string; refundedKobo: number; at: number } | null;
}

/** Thrown for malformed requests; the message is safe to show. */
export class DisputeValidationError extends ValidationError {}

const record = (body: unknown) =>
  (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

function paymentIdOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(value)) {
    throw new DisputeValidationError('That payment reference isn’t valid.');
  }
  return value;
}

export function parseOpenDispute(body: unknown): {
  paymentId: string;
  reason: DisputeReason;
  details: string;
} {
  const data = record(body);
  const reason = data.reason as DisputeReason;
  if (!DISPUTE_REASONS.includes(reason))
    throw new DisputeValidationError('Choose what went wrong.');
  const details = typeof data.details === 'string' ? data.details.trim() : '';
  if (details.length < 10) {
    throw new DisputeValidationError('Tell us a little more about what happened.');
  }
  if (details.length > 1000) throw new DisputeValidationError('Keep it under 1,000 characters.');
  return { paymentId: paymentIdOf(data.paymentId), reason, details };
}

export function parseDisputeRef(body: unknown): { paymentId: string } {
  return { paymentId: paymentIdOf(record(body).paymentId) };
}

export function parseDecision(body: unknown): {
  paymentId: string;
  action: 'refund' | 'reject';
  note: string;
} {
  const data = record(body);
  const action = data.action;
  if (action !== 'refund' && action !== 'reject') {
    throw new DisputeValidationError('Choose refund or reject.');
  }
  const note = typeof data.note === 'string' ? data.note.trim() : '';
  if (note.length < 5) throw new DisputeValidationError('Add a short note explaining why.');
  if (note.length > 500) throw new DisputeValidationError('Keep the note under 500 characters.');
  return { paymentId: paymentIdOf(data.paymentId), action, note };
}
