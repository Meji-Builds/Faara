import { ValidationError } from '../hum/validation';

/**
 * Payment requests ("invoices"): anyone can ask a specific person, or anyone with the link,
 * for an amount. The payer approves it like any payment; the request then shows as paid.
 */

export type RequestStatus = 'open' | 'paid' | 'cancelled' | 'expired';

export interface PersonRef {
  fullName: string;
  username: string;
}

export interface PaymentRequest {
  id: string;
  requester: PersonRef;
  /** Who is asked to pay; null means anyone with the link. */
  from: PersonRef | null;
  amountKobo: number;
  note: string;
  status: RequestStatus;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  paidBy: PersonRef | null;
  /** The payment that settled it. */
  paymentId: string | null;
}

/** A request as it appears in one person's list. */
export interface RequestListItem extends PaymentRequest {
  /** `sent`: I asked for it. `toPay`: I'm asked to pay (or paid) it. */
  role: 'sent' | 'toPay';
}

export const REQUEST_LIMITS = {
  minKobo: 10_000, // ₦100
  maxKobo: 500_000_000, // ₦5,000,000
  maxNote: 100,
  ttlMs: 30 * 86_400_000,
} as const;

export const REQUEST_ID = /^RQ[A-Za-z0-9_-]{8,40}$/;

/** Thrown for malformed requests; the message is safe to show. */
export class RequestValidationError extends ValidationError {}

const record = (body: unknown) =>
  (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

export function parseCreateRequest(body: unknown): {
  amountKobo: number;
  note: string;
  fromUsername: string | null;
} {
  const data = record(body);
  const { amountKobo, note, fromUsername } = data;
  if (
    typeof amountKobo !== 'number' ||
    !Number.isSafeInteger(amountKobo) ||
    amountKobo < REQUEST_LIMITS.minKobo ||
    amountKobo > REQUEST_LIMITS.maxKobo
  ) {
    throw new RequestValidationError('Ask for between ₦100 and ₦5,000,000.');
  }
  const text = typeof note === 'string' ? note.trim() : '';
  if (!text) throw new RequestValidationError('Say what it’s for.');
  if (text.length > REQUEST_LIMITS.maxNote) {
    throw new RequestValidationError('Keep the note under 100 characters.');
  }
  let from: string | null = null;
  if (fromUsername !== undefined && fromUsername !== null && fromUsername !== '') {
    if (typeof fromUsername !== 'string') throw new RequestValidationError('Check the username.');
    from = fromUsername.replace(/^@/, '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(from)) throw new RequestValidationError('Check the username.');
  }
  return { amountKobo, note: text, fromUsername: from };
}

export function parseRequestId(body: unknown): { id: string } {
  const id = record(body).id;
  if (typeof id !== 'string' || !REQUEST_ID.test(id)) {
    throw new RequestValidationError('That request isn’t valid.');
  }
  return { id };
}
