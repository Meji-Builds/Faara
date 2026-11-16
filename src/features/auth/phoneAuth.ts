import {
  signInWithPhoneNumber,
  type ApplicationVerifier,
  type ConfirmationResult,
  type UserCredential,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';
import { nationalNumber } from '@/lib/phone';

/**
 * Stand-in verifier used while only Firebase test numbers are allowed
 * (`appVerificationDisabledForTesting`). Test numbers are not checked against reCAPTCHA.
 * The SDK also calls an internal `_reset()` after each attempt.
 */
const testModeVerifier = {
  type: 'recaptcha',
  verify: async () => 'test-mode',
  _reset: () => undefined,
} as ApplicationVerifier;

/** "08114614728" → "+2348114614728" */
export function toE164(digits: string): string {
  return `+234${nationalNumber(digits)}`;
}

export interface PendingVerification {
  phoneE164: string;
  confirm: (code: string) => Promise<UserCredential>;
}

/** Sends a one-time code to the number. Resolves once the code has been requested. */
export async function requestPhoneCode(digits: string): Promise<PendingVerification> {
  const phoneE164 = toE164(digits);
  const confirmation: ConfirmationResult = await signInWithPhoneNumber(
    auth,
    phoneE164,
    testModeVerifier,
  );
  return { phoneE164, confirm: (code) => confirmation.confirm(code) };
}
