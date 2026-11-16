import type {
  CancelHumRequest,
  ChooseRecipientRequest,
  ClaimHumRequest,
  CreateHumRequest,
  CreateTransferRequest,
  LookupUserRequest,
  SettleHumRequest,
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
const MANUAL_CODE_PATTERN = /^\d{6}$/;

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
  if (!CLAIM_CHANNELS.includes(data.channel as ClaimChannel))
    throw new ValidationError('channel is invalid.');
  const channel = data.channel as ClaimChannel;

  if (channel === 'manual') {
    const code = typeof data.manualCode === 'string' ? data.manualCode.replace(/\s/g, '') : '';
    if (!MANUAL_CODE_PATTERN.test(code)) throw new ValidationError('manualCode must be 6 digits.');
    return { manualCode: code, channel };
  }

  const token = typeof data.token === 'string' ? data.token.toUpperCase() : '';
  if (!TOKEN_PATTERN.test(token)) throw new ValidationError('token is invalid.');
  const distance = data.distanceCm;
  if (
    distance !== undefined &&
    (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0)
  ) {
    throw new ValidationError('distanceCm must be a non-negative number.');
  }
  return { token, channel, distanceCm: distance as number | undefined };
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

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export function parseSettleHum(body: unknown): SettleHumRequest {
  const data = requireRecord(body);
  const paymentId = requireId(data.paymentId, 'paymentId');
  if (data.signature === undefined) return { paymentId };
  if (typeof data.signature !== 'string' || !SIGNATURE_PATTERN.test(data.signature)) {
    throw new ValidationError('signature is invalid.');
  }
  return { paymentId, signature: data.signature };
}

const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;

function requireUsername(value: unknown): string {
  const username = typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '';
  if (!USERNAME_PATTERN.test(username)) throw new ValidationError('username is invalid.');
  return username;
}

export function parseLookupUser(body: unknown): LookupUserRequest {
  return { username: requireUsername(requireRecord(body).username) };
}

export function parseCreateTransfer(body: unknown): CreateTransferRequest {
  const data = requireRecord(body);
  const { amount, currency, note } = parseCreateHum(data);
  return { username: requireUsername(data.username), amount, currency, note };
}
