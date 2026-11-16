import type { ShapeTriple } from './shapes';
import type { ClaimChannel, HumCurrency } from './rules';

/** Request and response bodies for the hum HTTP API (`/api/hums/*`). */

export interface CreateHumRequest {
  /** Decimal amount in major units, e.g. 12500 or 40.5. */
  amount: number;
  currency: HumCurrency;
  note?: string;
}

export interface CreateHumResponse {
  paymentId: string;
  /** 10-character Crockford base32 code to broadcast. */
  token: string;
  /** Six-digit fallback code for typing in when no channel connects. */
  manualCode: string;
  /** Epoch milliseconds after which the code can no longer be claimed. */
  expiresAt: number;
}

export interface ClaimHumRequest {
  /** Exactly one of `token` (sound, Bluetooth, QR) or `manualCode` (typed). */
  token?: string;
  manualCode?: string;
  channel: ClaimChannel;
  /** Receiver-side signal estimate, used to order claimants (closest first). */
  distanceCm?: number;
}

export interface ClaimHumResponse {
  paymentId: string;
  claimId: string;
  sender: { fullName: string; username: string };
  amount: number;
  currency: HumCurrency;
  note: string;
}

export interface ChooseRecipientRequest {
  paymentId: string;
  claimId: string;
}

export interface ChooseRecipientResponse {
  shapes: ShapeTriple;
  recipient: { fullName: string; username: string };
}

export interface CancelHumRequest {
  paymentId: string;
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'not-found'
  | 'expired'
  | 'already-chosen'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'internal';
