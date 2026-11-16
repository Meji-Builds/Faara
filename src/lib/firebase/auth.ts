import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';

import { firebaseApp } from './app';
import { PHONE_AUTH_TEST_NUMBERS_ONLY } from './config';

function createAuth(): Auth {
  try {
    // Persist the session in AsyncStorage so users stay signed in across launches.
    return initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialised (fast refresh).
    return getAuth(firebaseApp);
  }
}

export const auth: Auth = createAuth();
auth.settings.appVerificationDisabledForTesting = PHONE_AUTH_TEST_NUMBERS_ONLY;
