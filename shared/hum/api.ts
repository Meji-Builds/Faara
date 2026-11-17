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
  /** `walletAddress` is the recipient's Solana address (needed to send USDC). */
  recipient: { fullName: string; username: string; walletAddress: string | null };
}

/** Find someone by username, or by their Faara number (their phone number). */
export type LookupUserRequest = { username: string } | { phone: string };

export interface LookupUserResponse {
  fullName: string;
  username: string;
  /** Whether they can receive USDC. */
  hasWallet: boolean;
}

/** Send to a username: creates a payment already addressed to the recipient. */
export interface CreateTransferRequest {
  username: string;
  amount: number;
  currency: HumCurrency;
  note?: string;
}

export interface CreateTransferResponse {
  paymentId: string;
  /** Claim id of the recipient (for reading the safety badge). */
  claimId: string;
  recipient: { fullName: string; username: string; walletAddress: string | null };
}

export interface SettleHumRequest {
  paymentId: string;
  /** Solana transaction signature; required for USDC hums. */
  signature?: string;
}

export interface SettleHumResponse {
  settledAt: number;
  signature: string | null;
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

/** Add money (naira) through the payment partner's hosted checkout. */
export interface InitializeFundingRequest {
  /** Whole naira. */
  amount: number;
  /** Where checkout returns to: the web app or the native app. */
  platform: 'web' | 'native';
}

export interface InitializeFundingResponse {
  reference: string;
  checkoutUrl: string;
}

export interface VerifyFundingRequest {
  reference: string;
}

export interface VerifyFundingResponse {
  status: 'success' | 'pending' | 'failed';
  /** Naira credited (when successful). */
  amount: number;
}
