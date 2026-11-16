import type {
  CancelHumRequest,
  ChooseRecipientRequest,
  ClaimHumRequest,
  CreateHumRequest,
} from './api';
import {
  CLAIM_CHANNELS,
  CURRENCIES,
  MAX_AMOUNT,
  MAX_NOTE_LENGTH,
  type ClaimChannel,
  type HumCurrency,
} from './rules';

/** Thrown for malformed requests; the message is safe to show to the caller. */
export class ValidationError extends Error {}

const TOKEN_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) throw new ValidationError('Request body must be a JSON object.');
  return body;
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value))
    throw new ValidationError(`${field} is invalid.`);
  return value;
}

export function parseCreateHum(body: unknown): CreateHumRequest {
  const data = requireRecord(body);
  const currency = data.currency;
  if (!CURRENCIES.includes(currency as HumCurrency))
    throw new ValidationError('currency must be NGN or USDC.');
  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('amount must be a positive number.');
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    throw new ValidationError('amount can have at most two decimal places.');
  }
  if (currency === 'NGN' && !Number.isInteger(amount))
    throw new ValidationError('Naira amounts must be whole.');
  if (amount > MAX_AMOUNT[currency as HumCurrency])
    throw new ValidationError('amount is above the limit.');
  const note = data.note ?? '';
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    throw new ValidationError(`note must be text of at most ${MAX_NOTE_LENGTH} characters.`);
  }
  return { amount, currency: currency as HumCurrency, note: note.trim() };
}

export function parseClaimHum(body: unknown): ClaimHumRequest {
  const data = requireRecord(body);
  const token = typeof data.token === 'string' ? data.token.toUpperCase() : '';
  if (!TOKEN_PATTERN.test(token)) throw new ValidationError('token is invalid.');
  if (!CLAIM_CHANNELS.includes(data.channel as ClaimChannel))
    throw new ValidationError('channel is invalid.');
  const distance = data.distanceCm;
  if (
    distance !== undefined &&
    (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0)
  ) {
    throw new ValidationError('distanceCm must be a non-negative number.');
  }
  return {
    token,
    channel: data.channel as ClaimChannel,
    distanceCm: distance as number | undefined,
  };
}

export function parseChooseRecipient(body: unknown): ChooseRecipientRequest {
  const data = requireRecord(body);
  return {
    paymentId: requireId(data.paymentId, 'paymentId'),
    claimId: requireId(data.claimId, 'claimId'),
  };
}

export function parseCancelHum(body: unknown): CancelHumRequest {
  const data = requireRecord(body);
  return { paymentId: requireId(data.paymentId, 'paymentId') };
}
