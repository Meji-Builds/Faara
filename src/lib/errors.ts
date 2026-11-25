import { UsernameTakenError } from '@/features/auth/errors';
import { PinLockedError, WrongPinError } from '@/features/wallet/vault.types';
import { ApiRequestError } from '@/lib/api/client';

/** An error whose message was written for people, so it's shown as it is. */
export class ShowableError extends Error {}

/**
 * The message to show for an error. Only errors written for people (wrong PIN, server
 * messages, taken username) pass through; anything else, such as a library or system
 * error, becomes `fallback`, so no technical text or codes reach the screen.
 */
export function friendlyError(error: unknown, fallback: string): string {
  if (
    error instanceof ApiRequestError ||
    error instanceof UsernameTakenError ||
    error instanceof WrongPinError ||
    error instanceof PinLockedError ||
    error instanceof ShowableError
  ) {
    return error.message;
  }
  return fallback;
}

/** Message for a failure to open the microphone. */
export function microphoneError(error: unknown): string {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/denied|notallowed|permission/i.test(text)) {
    return 'Faara can’t use the microphone. Allow it in your phone’s settings and try again.';
  }
  if (/notfound|no .*device|no .*input/i.test(text)) {
    return 'No microphone was found on this device.';
  }
  return 'The microphone couldn’t start. Close other apps that might be using it and try again.';
}
