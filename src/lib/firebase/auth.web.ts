import { getAuth, type Auth } from 'firebase/auth';

import { firebaseApp } from './app';
import { PHONE_AUTH_TEST_NUMBERS_ONLY } from './config';

/** Browser auth persists the session in IndexedDB by default. */
export const auth: Auth = getAuth(firebaseApp);
auth.settings.appVerificationDisabledForTesting = PHONE_AUTH_TEST_NUMBERS_ONLY;
