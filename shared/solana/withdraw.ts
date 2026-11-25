import { ValidationError } from '../hum/validation';

import { SOLANA_ADDRESS_PATTERN } from './constants';

/** Most USDC that can be sent out at once, in cents. */
export const MAX_WITHDRAW_CENTS = 500_000;

export interface WithdrawRequest {
  /** Destination Solana address. */
  address: string;
  amountCents: number;
  /** Chosen by the phone, so a retried request never sends twice. */
  requestId: string;
}

/** Thrown for malformed requests; the message is safe to show. */
export class WithdrawValidationError extends ValidationError {}

export function parseWithdrawRequest(body: unknown): WithdrawRequest {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { address, amountCents, requestId } = data;
  if (typeof address !== 'string' || !SOLANA_ADDRESS_PATTERN.test(address)) {
    throw new WithdrawValidationError('That isn’t a Solana address.');
  }
  if (
    typeof amountCents !== 'number' ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > MAX_WITHDRAW_CENTS
  ) {
    throw new WithdrawValidationError('Choose between 0.01 and 5,000 USDC.');
  }
  return { address, amountCents, requestId: parseRequestId(requestId) };
}

export function parseRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^WD[A-Za-z0-9_-]{8,40}$/.test(value)) {
    throw new WithdrawValidationError('That request isn’t valid.');
  }
  return value;
}

/** A signed USDC payment for Faara to co-sign as fee payer (base64; well under 1,232 bytes). */
export function parseSponsorRequest(body: unknown): { transaction: string } {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { transaction } = data;
  if (
    typeof transaction !== 'string' ||
    transaction.length > 2000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(transaction)
  ) {
    throw new WithdrawValidationError('The payment couldn’t be read.');
  }
  return { transaction };
}
