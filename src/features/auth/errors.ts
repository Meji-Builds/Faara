import { FirebaseError } from 'firebase/app';

import { PHONE_AUTH_TEST_NUMBERS_ONLY } from '@/lib/firebase';

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`@${username} was just taken. Choose another username.`);
  }
}

/** Thrown when Firestore doesn't answer in time (offline, or the database isn't set up). */
export class ProfileTimeoutError extends Error {
  constructor() {
    super('Timed out reaching Firestore');
  }
}

/** Turns Firebase and app errors into messages fit for the user. */
export function authErrorMessage(error: unknown): string {
  const message = friendlyMessage(error);
  // While in test mode, append the underlying cause so setup problems can be diagnosed.
  if (PHONE_AUTH_TEST_NUMBERS_ONLY) {
    if (error instanceof FirebaseError) return `${message} (${error.code})`;
    if (error instanceof Error && !(error instanceof UsernameTakenError)) {
      return `${message} (${error.message})`;
    }
  }
  return message;
}

function friendlyMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-phone-number':
      case 'auth/missing-phone-number':
        return 'That phone number doesn’t look right. Check it and try again.';
      case 'auth/invalid-verification-code':
        return 'That code isn’t right. Check the SMS and try again.';
      case 'auth/code-expired':
      case 'auth/session-expired':
        return 'That code has expired. Request a new one.';
      case 'auth/too-many-requests':
      case 'auth/quota-exceeded':
        return 'Too many attempts. Wait a few minutes and try again.';
      case 'auth/network-request-failed':
        return 'No connection. Check your internet and try again.';
      case 'auth/operation-not-allowed':
        return /region/i.test(error.message)
          ? 'Sign-in codes can’t be sent to this country yet (Firebase SMS region policy).'
          : 'Phone sign-in is not enabled for this project yet.';
      case 'auth/billing-not-enabled':
        return 'Phone sign-in needs billing enabled on the Firebase project.';
      case 'auth/captcha-check-failed':
      case 'auth/invalid-app-credential':
      case 'auth/missing-app-credential':
        return PHONE_AUTH_TEST_NUMBERS_ONLY
          ? 'This preview only works with the test phone numbers set up in Firebase.'
          : 'We couldn’t verify this device. Try again.';
      case 'permission-denied':
        return 'You don’t have permission to do that.';
      case 'unavailable':
      case 'deadline-exceeded':
        return 'Faara can’t be reached right now. Try again shortly.';
      case 'not-found':
      case 'failed-precondition':
        return 'Your account couldn’t be saved: the database isn’t set up yet.';
    }
  }
  if (error instanceof UsernameTakenError) return error.message;
  if (error instanceof ProfileTimeoutError) {
    return 'Saving your account is taking too long. Check your connection and try again.';
  }
  return 'Something went wrong. Try again.';
}
